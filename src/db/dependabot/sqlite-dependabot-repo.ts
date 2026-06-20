import type { Database } from 'bun:sqlite'
import type { DependabotRepo } from './dependabot-repo.ts'

type HistoryRow = { repo_full_name: string; count: number; recorded_at: string }

export function createSqliteDependabotRepo(db: Database): DependabotRepo {
  const getLatest = db.query<{ recorded_at: string }, [string]>(
    'SELECT recorded_at FROM dependabot_history WHERE repo_full_name = ? ORDER BY recorded_at DESC LIMIT 1',
  )

  return {
    maybeRecordSnapshot(fullName, count, now, minIntervalMs) {
      const latest = getLatest.get(fullName)
      if (latest) {
        const age = now.getTime() - new Date(latest.recorded_at).getTime()
        if (age < minIntervalMs) return
      }
      db.run(
        'INSERT INTO dependabot_history (repo_full_name, count, recorded_at) VALUES (?, ?, ?)',
        [fullName, count, now.toISOString()],
      )
    },

    getHistory(fullName) {
      return db
        .query<HistoryRow, [string]>(
          'SELECT repo_full_name, count, recorded_at FROM dependabot_history WHERE repo_full_name = ? ORDER BY recorded_at ASC',
        )
        .all(fullName)
        .map((row) => ({
          repoFullName: row.repo_full_name,
          count: row.count,
          recordedAt: new Date(row.recorded_at),
        }))
    },

    pruneOld(daysToKeep, now) {
      const cutoff = new Date(now.getTime() - daysToKeep * 24 * 60 * 60 * 1000).toISOString()
      db.run('DELETE FROM dependabot_history WHERE recorded_at < ?', [cutoff])
    },
  }
}
