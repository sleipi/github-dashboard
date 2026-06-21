import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { runMigrations } from '../../../src/db/migrations.ts'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

describe('AuthRepo', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('getToken returns null when no token saved', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auth-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    expect(repos.auth.getToken()).toBeNull()

    repos.close()
  })

  test('saveToken persists all three fields', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auth-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.auth.saveToken({
      pat: 'ghp_test',
      username: 'alice',
      avatarUrl: 'https://example.com/avatar.png',
      expiresAt: null,
    })
    const token = repos.auth.getToken()

    expect(token?.pat).toBe('ghp_test')
    expect(token?.username).toBe('alice')
    expect(token?.avatarUrl).toBe('https://example.com/avatar.png')

    repos.close()
  })

  test('saveToken overwrites existing token', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auth-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.auth.saveToken({
      pat: 'old',
      username: 'old',
      avatarUrl: 'old',
      expiresAt: null,
    })
    repos.auth.saveToken({
      pat: 'new',
      username: 'new',
      avatarUrl: 'new',
      expiresAt: null,
    })

    expect(repos.auth.getToken()?.pat).toBe('new')

    repos.close()
  })

  test('deleteToken removes token', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auth-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.auth.saveToken({
      pat: 'ghp_test',
      username: 'alice',
      avatarUrl: 'https://example.com/avatar.png',
      expiresAt: null,
    })
    repos.auth.deleteToken()

    expect(repos.auth.getToken()).toBeNull()

    repos.close()
  })

  test('saveToken persists expiresAt when provided', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auth-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const expiresAt = new Date('2026-12-31T21:01:12.000Z')

    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt })
    const token = repos.auth.getToken()

    expect(token?.expiresAt?.toISOString()).toBe('2026-12-31T21:01:12.000Z')

    repos.close()
  })

  test('saveToken with null expiresAt returns null from getToken', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auth-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    const token = repos.auth.getToken()

    expect(token?.expiresAt).toBeNull()

    repos.close()
  })

  test('getToken returns null expiresAt for tokens saved without the key (upgrade path)', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auth-')
    cleanup.push(dir)

    // Simulate a pre-upgrade token by writing directly to SQLite (no pat_expires_at row)
    const rawDb = new Database(dbPath, { create: true })
    rawDb.run('PRAGMA journal_mode = WAL')
    runMigrations(rawDb)
    rawDb.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('pat', 'ghp_legacy')")
    rawDb.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('username', 'alice')")
    rawDb.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('avatar_url', '')")
    rawDb.close()

    const repos = createSqliteRepos(dbPath)
    const token = repos.auth.getToken()

    expect(token?.pat).toBe('ghp_legacy')
    expect(token?.expiresAt).toBeNull()

    repos.close()
  })

  test('deleteToken removes pat_expires_at', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auth-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.auth.saveToken({
      pat: 'ghp_test',
      username: 'alice',
      avatarUrl: '',
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    })
    repos.auth.deleteToken()
    repos.close()

    // Re-open the DB directly to insert PAT rows without pat_expires_at and verify getToken returns null
    const rawDb = new Database(dbPath)
    rawDb.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('pat', 'ghp_new')")
    rawDb.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('username', 'bob')")
    rawDb.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('avatar_url', '')")
    rawDb.close()

    const repos2 = createSqliteRepos(dbPath)
    const token = repos2.auth.getToken()

    expect(token?.expiresAt).toBeNull()

    repos2.close()
  })
})
