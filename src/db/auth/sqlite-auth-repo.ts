import type { Database } from 'bun:sqlite'
import type { AuthRepo } from './auth-repo.ts'

type SettingsRow = { value: string }

export function createSqliteAuthRepo(db: Database): AuthRepo {
  const get = db.query<SettingsRow, [string]>('SELECT value FROM settings WHERE key = ?')
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

  return {
    getToken() {
      const pat = get.get('pat')?.value
      if (!pat) return null
      const username = get.get('username')?.value ?? ''
      const avatarUrl = get.get('avatar_url')?.value ?? ''
      return { pat, username, avatarUrl }
    },

    saveToken(token) {
      db.transaction(() => {
        upsert.run('pat', token.pat)
        upsert.run('username', token.username)
        upsert.run('avatar_url', token.avatarUrl)
      })()
    },

    deleteToken() {
      db.run("DELETE FROM settings WHERE key IN ('pat', 'username', 'avatar_url')")
    },
  }
}
