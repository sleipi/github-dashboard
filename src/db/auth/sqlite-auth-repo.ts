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
      const expiresAtRaw = get.get('pat_expires_at')?.value
      const expiresAt =
        expiresAtRaw === undefined
          ? undefined
          : expiresAtRaw === 'none'
            ? null
            : new Date(expiresAtRaw)
      return { pat, username, avatarUrl, expiresAt }
    },

    saveToken(token) {
      db.transaction(() => {
        upsert.run('pat', token.pat)
        upsert.run('username', token.username)
        upsert.run('avatar_url', token.avatarUrl)
        if (token.expiresAt instanceof Date) {
          upsert.run('pat_expires_at', token.expiresAt.toISOString())
        } else if (token.expiresAt === null) {
          upsert.run('pat_expires_at', 'none')
        } else {
          db.run("DELETE FROM settings WHERE key = 'pat_expires_at'")
        }
      })()
    },

    deleteToken() {
      db.run(
        "DELETE FROM settings WHERE key IN ('pat', 'username', 'avatar_url', 'pat_expires_at')",
      )
    },
  }
}
