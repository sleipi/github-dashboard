// tests/unit/github/github-client.test.ts
import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import { createGitHubClient } from '../../../src/github/github-client.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

function makeJsonFetch(responses: Record<string, unknown>) {
  return mock(async (url: string) => {
    const path = url.replace('https://api.github.com', '')
    const key = Object.keys(responses).find((k) => path.startsWith(k))
    if (!key) return new Response('Not found', { status: 404 })
    return new Response(JSON.stringify(responses[key]), {
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

describe('GitHubClient', () => {
  test('getUser maps login and avatar_url', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: 'https://x.com/a.png' })

    const fetchFn = makeJsonFetch({
      '/user': { login: 'alice', avatar_url: 'https://x.com/a.png' },
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    const user = await client.getUser()
    expect(user.login).toBe('alice')
    expect(user.avatarUrl).toBe('https://x.com/a.png')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCiStatus returns success when all check-runs completed successfully', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: 'https://x.com/a.png' })

    const fetchFn = makeJsonFetch({
      '/repos/alice/alpha/commits/abc123/check-runs': {
        check_runs: [
          { status: 'completed', conclusion: 'success' },
          { status: 'completed', conclusion: 'success' },
        ],
      },
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getCiStatus('alice/alpha', 'abc123')).toBe('success')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCiStatus returns failure when any run failed', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: 'https://x.com/a.png' })

    const fetchFn = makeJsonFetch({
      '/repos/alice/alpha/commits/abc123/check-runs': {
        check_runs: [
          { status: 'completed', conclusion: 'success' },
          { status: 'completed', conclusion: 'failure' },
        ],
      },
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getCiStatus('alice/alpha', 'abc123')).toBe('failure')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getDependabotCount returns null on 403', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '' })

    const fetchFn = mock(async () => new Response('{}', { status: 403 }))
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getDependabotCount('alice/alpha')).toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })
})
