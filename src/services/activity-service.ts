// src/services/activity-service.ts
import type { Repos } from '../db/repos.ts'
import type { Activity, ActivityEventType, RefreshHint } from '../db/types.ts'
import type { GitHubClient } from '../github/github-client.ts'

const DEP_TTL_MS = 5 * 60_000 // 5 minutes
const PR_TTL_MS = 5 * 60_000 // 5 minutes — force PR+commit+CI refresh

export type SyncResult = {
  readonly activities: readonly Activity[]
  readonly refreshNeeded: ReadonlySet<RefreshHint>
}

export type ActivityService = {
  sync(fullName: string): Promise<SyncResult>
  countNewSince(since: Date): number
}

export function createActivityService(repos: Repos, client: GitHubClient): ActivityService {
  return {
    async sync(fullName) {
      const now = Date.now()
      const meta = repos.activity.getMeta(fullName)
      const hints = new Set<RefreshHint>()

      // PR TTL: never fetched or last fetch > 5 min ago → force full refresh
      // Uses prsCachedAt (stamped by card-service after each GitHub PR fetch),
      // NOT eventsCachedAt which resets on every event poll and never accumulates.
      const lastPrsSync = meta?.prsCachedAt?.getTime() ?? 0
      if (!meta?.prsCachedAt || now - lastPrsSync > PR_TTL_MS) {
        hints.add('prs')
        hints.add('commits')
        hints.add('ci')
      }

      // Events poll
      const pollIntervalMs = (meta?.pollIntervalSecs ?? 60) * 1000
      const needsEventsPoll =
        !meta?.eventsCachedAt || now - meta.eventsCachedAt.getTime() > pollIntervalMs

      if (needsEventsPoll) {
        const result = await client.getRepoEvents(fullName, meta?.eventsEtag ?? undefined)
        if ('notModified' in result) {
          repos.activity.upsertMeta(fullName, { eventsCachedAt: new Date() })
        } else {
          const newActivities = mapEvents(fullName, result.events, hints)
          if (newActivities.length > 0) {
            repos.activity.upsertActivities(fullName, newActivities)
          }
          repos.activity.upsertMeta(fullName, {
            eventsEtag: result.etag,
            eventsCachedAt: new Date(),
            pollIntervalSecs: Math.max(60, result.pollIntervalSecs),
          })
        }
      }

      // Dependabot poll (independent TTL)
      const depCached = meta?.dependabotCachedAt?.getTime() ?? 0
      if (now - depCached > DEP_TTL_MS) {
        await syncDependabotAlerts(fullName, repos, client)
        repos.activity.upsertMeta(fullName, { dependabotCachedAt: new Date() })
      }

      return {
        activities: repos.activity.getActivities(fullName),
        refreshNeeded: hints,
      }
    },

    countNewSince(since: Date) {
      return repos.activity.countNewSince(since)
    },
  }
}

function mapEvents(
  fullName: string,
  events: readonly {
    id: string
    type: string
    actor: { login: string }
    payload: Record<string, unknown>
    createdAt: string
  }[],
  hints: Set<RefreshHint>,
): Array<Omit<Activity, 'id'>> {
  const now = new Date()
  const activities: Array<Omit<Activity, 'id'>> = []

  for (const event of events) {
    const occurredAt = new Date(event.createdAt)
    const actor = `@${event.actor.login}`

    if (event.type === 'PullRequestEvent') {
      const p = event.payload as {
        action: string
        pull_request: { number: number; title?: string; merged?: boolean | null; html_url?: string }
      }
      const pr = p.pull_request
      const prUrl = pr.html_url ?? `https://github.com/${fullName}/pull/${pr.number}`
      const prLabel = pr.title ? `#${pr.number} — ${pr.title}` : `#${pr.number}`
      if (p.action === 'opened') {
        hints.add('prs')
        activities.push({
          repoFullName: fullName,
          eventType: 'pr_opened',
          actor,
          subject: `opened ${prLabel}`,
          linkUrl: prUrl,
          occurredAt,
          recordedAt: now,
          githubEventId: event.id,
        })
      } else if (p.action === 'merged') {
        hints.add('prs')
        activities.push({
          repoFullName: fullName,
          eventType: 'pr_merged',
          actor,
          subject: `merged ${prLabel}`,
          linkUrl: prUrl,
          occurredAt,
          recordedAt: now,
          githubEventId: event.id,
        })
      } else if (p.action === 'closed') {
        hints.add('prs')
        const eventType: ActivityEventType = pr.merged ? 'pr_merged' : 'pr_abandoned'
        const subject = pr.merged ? `merged ${prLabel}` : `closed #${pr.number} without merging`
        activities.push({
          repoFullName: fullName,
          eventType,
          actor,
          subject,
          linkUrl: prUrl,
          occurredAt,
          recordedAt: now,
          githubEventId: event.id,
        })
      }
    } else if (event.type === 'PullRequestReviewEvent') {
      const p = event.payload as {
        action: string
        review: { state: string; html_url: string }
        pull_request: { number: number; title?: string; html_url?: string }
      }
      if (p.action !== 'submitted' && p.action !== 'created') continue
      const pr = p.pull_request
      const reviewUrl = p.review.html_url
      const prLabel = pr.title ? `#${pr.number} — ${pr.title}` : `#${pr.number}`
      if (p.review.state === 'approved') {
        activities.push({
          repoFullName: fullName,
          eventType: 'pr_review_approved',
          actor,
          subject: `approved ${prLabel}`,
          linkUrl: reviewUrl,
          occurredAt,
          recordedAt: now,
          githubEventId: event.id,
        })
      } else if (p.review.state === 'changes_requested') {
        activities.push({
          repoFullName: fullName,
          eventType: 'pr_review_changes_requested',
          actor,
          subject: `requested changes on ${prLabel}`,
          linkUrl: reviewUrl,
          occurredAt,
          recordedAt: now,
          githubEventId: event.id,
        })
      }
    } else if (event.type === 'ReleaseEvent') {
      const p = event.payload as {
        action: string
        release: { tag_name: string; name: string | null; html_url: string }
      }
      if (p.action !== 'published') continue
      const rel = p.release
      const namePart = rel.name && rel.name !== rel.tag_name ? ` — ${rel.name}` : ''
      activities.push({
        repoFullName: fullName,
        eventType: 'release',
        actor,
        subject: `released ${rel.tag_name}${namePart}`,
        linkUrl: rel.html_url,
        occurredAt,
        recordedAt: now,
        githubEventId: event.id,
      })
    } else if (event.type === 'PushEvent') {
      const p = event.payload as { ref: string; before: string; head: string }
      const branch = p.ref.replace('refs/heads/', '')
      if (branch !== 'main' && branch !== 'master') continue
      hints.add('commits')
      hints.add('ci')
      // push events not recorded — too noisy for the activity strip
    }
  }

  return activities
}

async function syncDependabotAlerts(
  fullName: string,
  repos: Repos,
  client: GitHubClient,
): Promise<void> {
  const alerts = await client.getDependabotAlerts(fullName)
  const now = new Date()
  const mapped = alerts.map((a) => ({
    repoFullName: fullName,
    eventType: 'security_alert' as ActivityEventType,
    actor: '@dependabot',
    subject: `security: ${a.packageName} — ${a.summary}`,
    linkUrl: a.htmlUrl,
    occurredAt: new Date(a.createdAt),
    recordedAt: now,
    githubEventId: null,
  }))
  repos.activity.replaceSecurityAlerts(fullName, mapped)
}
