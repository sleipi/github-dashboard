import type { Database } from 'bun:sqlite'
import type { GlobalSearchRepo } from './global-search-repo.ts'

const KEY = 'global_search_enabled'

export function createSqliteGlobalSearchRepo(db: Database): GlobalSearchRepo {
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
