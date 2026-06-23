import type { Database } from 'bun:sqlite'
import type { Activity, ActivityEventType } from '../types.ts'
import type { ActivityRepo } from './activity-repo.ts'

const PRUNE_DAYS = 30

type ActivityRow = {
  id: number
  repo_full_name: string
  event_type: string
  actor: string
  subject: string
  link_url: string
  occurred_at: string
  recorded_at: string
  github_event_id: string | null
}

type MetaRow = {
  repo_full_name: string
  events_etag: string | null
  events_cached_at: string | null
  poll_interval_secs: number
  dependabot_cached_at: string | null
  prs_cached_at: string | null
}

export function createSqliteActivityRepo(db: Database): ActivityRepo {
  return {
    getActivities(fullName) {
      return db
        .query<ActivityRow, [string]>(
          'SELECT * FROM activity WHERE repo_full_name = ? ORDER BY occurred_at DESC',
        )
        .all(fullName)
        .map(rowToActivity)
    },

    upsertActivities(fullName, activities) {
      const cutoff = new Date(Date.now() - PRUNE_DAYS * 86_400_000).toISOString()
      db.transaction(() => {
        for (const a of activities) {
          db.run(
            `INSERT OR IGNORE INTO activity
             (repo_full_name, event_type, actor, subject, link_url, occurred_at, recorded_at, github_event_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              a.repoFullName,
              a.eventType,
              a.actor,
              a.subject,
              a.linkUrl,
              a.occurredAt.toISOString(),
              a.recordedAt.toISOString(),
              a.githubEventId ?? null,
            ],
          )
        }
        db.run('DELETE FROM activity WHERE repo_full_name = ? AND occurred_at < ?', [
          fullName,
          cutoff,
        ])
      })()
    },

    replaceSecurityAlerts(fullName, alerts) {
      db.transaction(() => {
        db.run(`DELETE FROM activity WHERE repo_full_name = ? AND event_type = 'security_alert'`, [
          fullName,
        ])
        for (const a of alerts) {
          db.run(
            `INSERT INTO activity
             (repo_full_name, event_type, actor, subject, link_url, occurred_at, recorded_at, github_event_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              a.repoFullName,
              a.eventType,
              a.actor,
              a.subject,
              a.linkUrl,
              a.occurredAt.toISOString(),
              a.recordedAt.toISOString(),
              null,
            ],
          )
        }
      })()
    },

    getDependabotCount(fullName) {
      const row = db
        .query<{ count: number }, [string]>(
          `SELECT COUNT(*) as count FROM activity
           WHERE repo_full_name = ? AND event_type = 'security_alert'`,
        )
        .get(fullName)
      return row?.count ?? 0
    },

    getMeta(fullName) {
      const row = db
        .query<MetaRow, [string]>('SELECT * FROM activity_meta WHERE repo_full_name = ?')
        .get(fullName)
      if (!row) return null
      return {
        repoFullName: row.repo_full_name,
        eventsEtag: row.events_etag,
        eventsCachedAt: row.events_cached_at ? new Date(row.events_cached_at) : null,
        pollIntervalSecs: row.poll_interval_secs,
        dependabotCachedAt: row.dependabot_cached_at ? new Date(row.dependabot_cached_at) : null,
        prsCachedAt: row.prs_cached_at ? new Date(row.prs_cached_at) : null,
      }
    },

    upsertMeta(fullName, meta) {
      const existing = db
        .query<MetaRow, [string]>('SELECT * FROM activity_meta WHERE repo_full_name = ?')
        .get(fullName)
      const base: MetaRow = existing ?? {
        repo_full_name: fullName,
        events_etag: null,
        events_cached_at: null,
        poll_interval_secs: 60,
        dependabot_cached_at: null,
        prs_cached_at: null,
      }
      db.run(
        `INSERT OR REPLACE INTO activity_meta
         (repo_full_name, events_etag, events_cached_at, poll_interval_secs, dependabot_cached_at, prs_cached_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          fullName,
          meta.eventsEtag !== undefined ? meta.eventsEtag : base.events_etag,
          meta.eventsCachedAt !== undefined
            ? (meta.eventsCachedAt?.toISOString() ?? null)
            : base.events_cached_at,
          meta.pollIntervalSecs !== undefined ? meta.pollIntervalSecs : base.poll_interval_secs,
          meta.dependabotCachedAt !== undefined
            ? (meta.dependabotCachedAt?.toISOString() ?? null)
            : base.dependabot_cached_at,
          meta.prsCachedAt !== undefined
            ? (meta.prsCachedAt?.toISOString() ?? null)
            : base.prs_cached_at,
        ],
      )
    },
  }
}

function rowToActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    repoFullName: row.repo_full_name,
    eventType: row.event_type as ActivityEventType,
    actor: row.actor,
    subject: row.subject,
    linkUrl: row.link_url,
    occurredAt: new Date(row.occurred_at),
    recordedAt: new Date(row.recorded_at),
    githubEventId: row.github_event_id,
  }
}
