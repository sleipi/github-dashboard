import { afterEach, describe, expect, test } from 'bun:test'
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
    })
    repos.auth.saveToken({
      pat: 'new',
      username: 'new',
      avatarUrl: 'new',
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
    })
    repos.auth.deleteToken()

    expect(repos.auth.getToken()).toBeNull()

    repos.close()
  })
})
