import type { Database } from 'bun:sqlite'
import type { AutoSortRepo } from './auto-sort-repo.ts'

const KEY = 'auto_sort_enabled'

export function createSqliteAutoSortRepo(db: Database): AutoSortRepo {
  const get = db.query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

  return {
    isEnabled() {
      return get.get(KEY)?.value === '1'
    },

    setEnabled(enabled) {
      upsert.run(KEY, enabled ? '1' : '0')
    },
  }
}
