import type { Database } from 'bun:sqlite'
import type { Label, PullRequest } from '../types.ts'
import type { PrRepo } from './pr-repo.ts'

type CacheRow = {
  full_name: string
  last_commit_at: string | null
  pr_total: number
  dependabot_count: number | null
  cached_at: string
}

type PrRow = {
  repo_full_name: string
  number: number
  title: string
  draft: number
  ci_status: string
  pr_url: string
  creator: string
  labels: string
  created_at: string
  updated_at: string
}

export function createSqlitePrRepo(db: Database): PrRepo {
  return {
    getCache(fullName) {
      const row = db
        .query<CacheRow, [string]>('SELECT * FROM repo_cache WHERE full_name = ?')
        .get(fullName)
      if (!row) return null
      return {
        fullName: row.full_name,
        lastCommitAt: row.last_commit_at ? new Date(row.last_commit_at) : null,
        prTotal: row.pr_total,
        dependabotCount: row.dependabot_count,
        cachedAt: new Date(row.cached_at),
      }
    },

    upsertCache(fullName, data) {
      db.run(
        `INSERT OR REPLACE INTO repo_cache
         (full_name, last_commit_at, pr_total, dependabot_count, cached_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          fullName,
          data.lastCommitAt?.toISOString() ?? null,
          data.prTotal,
          data.dependabotCount,
          new Date().toISOString(),
        ],
      )
    },

    getPrs(fullName) {
      return db
        .query<PrRow, [string]>(
          'SELECT * FROM pull_requests WHERE repo_full_name = ? ORDER BY number DESC',
        )
        .all(fullName)
        .map((row) => ({
          repoFullName: row.repo_full_name,
          number: row.number,
          title: row.title,
          draft: row.draft === 1,
          ciStatus: row.ci_status as PullRequest['ciStatus'],
          prUrl: row.pr_url,
          creator: row.creator,
          labels: JSON.parse(row.labels) as Label[],
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        }))
    },

    upsertPrs(fullName, prs) {
      db.transaction(() => {
        db.run('DELETE FROM pull_requests WHERE repo_full_name = ?', [fullName])
        for (const pr of prs) {
          db.run(
            `INSERT INTO pull_requests
             (repo_full_name, number, title, draft, ci_status, pr_url, creator, labels, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              pr.repoFullName,
              pr.number,
              pr.title,
              pr.draft ? 1 : 0,
              pr.ciStatus,
              pr.prUrl,
              pr.creator,
              JSON.stringify(pr.labels),
              pr.createdAt.toISOString(),
              pr.updatedAt.toISOString(),
            ],
          )
        }
      })()
    },
  }
}
