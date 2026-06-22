// src/services/activity-service.ts
import type { Repos } from '../db/repos.ts'
import type { Activity, ActivityEventType, RefreshHint } from '../db/types.ts'
import type { GitHubClient } from '../github/github-client.ts'

const DEP_TTL_MS = 5 * 60_000 // 5 minutes
const HARD_TTL_MS = 3 * 60_000 // 3 minutes — force full refresh if events unseen

export type SyncResult = {
  readonly activities: readonly Activity[]
  readonly refreshNeeded: ReadonlySet<RefreshHint>
}

export type ActivityService = {
  sync(fullName: string): Promise<SyncResult>
}

export function createActivityService(repos: Repos, client: GitHubClient): ActivityService {
  return {
    async sync(fullName) {
      const now = Date.now()
      const meta = repos.activity.getMeta(fullName)
      const hints = new Set<RefreshHint>()

      // Hard TTL fallback: never synced or synced > 10 min ago → force full refresh
      const lastSync = meta?.eventsCachedAt?.getTime() ?? 0
      const isFirstLoad = !meta?.eventsCachedAt
      if (isFirstLoad || now - lastSync > HARD_TTL_MS) {
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
        pull_request: { number: number; title: string; merged: boolean; html_url: string }
      }
      if (p.action !== 'closed') continue
      hints.add('prs')
      const pr = p.pull_request
      const eventType: ActivityEventType = pr.merged ? 'pr_merged' : 'pr_abandoned'
      const subject = pr.merged
        ? `merged #${pr.number} — ${pr.title}`
        : `closed #${pr.number} without merging`
      activities.push({
        repoFullName: fullName,
        eventType,
        actor,
        subject,
        linkUrl: pr.html_url,
        occurredAt,
        recordedAt: now,
        githubEventId: event.id,
      })
    } else if (event.type === 'PullRequestReviewEvent') {
      const p = event.payload as {
        action: string
        review: { state: string; html_url: string }
        pull_request: { number: number; title: string; html_url: string }
      }
      if (p.action !== 'submitted') continue
      const pr = p.pull_request
      if (p.review.state === 'approved') {
        activities.push({
          repoFullName: fullName,
          eventType: 'pr_review_approved',
          actor,
          subject: `approved #${pr.number} — ${pr.title}`,
          linkUrl: pr.html_url,
          occurredAt,
          recordedAt: now,
          githubEventId: event.id,
        })
      } else if (p.review.state === 'changes_requested') {
        activities.push({
          repoFullName: fullName,
          eventType: 'pr_review_changes_requested',
          actor,
          subject: `requested changes on #${pr.number} — ${pr.title}`,
          linkUrl: pr.html_url,
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
  if (alerts.length === 0) return

  const existing = new Set(
    repos.activity
      .getActivities(fullName)
      .filter((a) => a.eventType === 'security_alert')
      .map((a) => a.linkUrl),
  )

  const now = new Date()
  const newAlerts = alerts
    .filter((a) => !existing.has(a.htmlUrl))
    .map((a) => ({
      repoFullName: fullName,
      eventType: 'security_alert' as ActivityEventType,
      actor: '@dependabot',
      subject: `security: ${a.packageName} — ${a.summary}`,
      linkUrl: a.htmlUrl,
      occurredAt: new Date(a.createdAt),
      recordedAt: now,
      githubEventId: null,
    }))

  if (newAlerts.length > 0) {
    repos.activity.upsertActivities(fullName, newAlerts)
  }
}
