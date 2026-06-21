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
    repos.auth.saveToken({
      pat: 'ghp_test',
      username: 'alice',
      avatarUrl: 'https://x.com/a.png',
      expiresAt: null,
    })

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
    repos.auth.saveToken({
      pat: 'ghp_test',
      username: 'alice',
      avatarUrl: 'https://x.com/a.png',
      expiresAt: null,
    })

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
    repos.auth.saveToken({
      pat: 'ghp_test',
      username: 'alice',
      avatarUrl: 'https://x.com/a.png',
      expiresAt: null,
    })

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
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(async () => new Response('{}', { status: 403 }))
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getDependabotCount('alice/alpha')).toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })

  test('getDependabotCount returns null on 400 (page param not supported)', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(
      async () =>
        new Response(
          JSON.stringify({ message: 'Pagination using the `page` parameter is not supported.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getDependabotCount('alice/alpha')).toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })

  test('getDependabotCount counts alerts on a single page', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const alerts = Array.from({ length: 5 }, (_, i) => ({ number: i + 1 }))
    const fetchFn = mock(
      async () =>
        new Response(JSON.stringify(alerts), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getDependabotCount('alice/alpha')).toBe(5)

    repos.close()
    cleanupTempDir(dir)
  })

  test('getDependabotCount folgt Link-Header cursor-basierter Paginierung', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const page1 = Array.from({ length: 100 }, (_, i) => ({ number: i + 1 }))
    const page2 = Array.from({ length: 16 }, (_, i) => ({ number: i + 101 }))

    const fetchFn = mock(async (url: string) => {
      if (url.includes('after=cur1')) {
        return new Response(JSON.stringify(page2), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify(page1), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          Link: '<https://api.github.com/repos/alice/big/dependabot/alerts?per_page=100&after=cur1&state=open>; rel="next"',
        },
      })
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getDependabotCount('alice/big')).toBe(116)

    repos.close()
    cleanupTempDir(dir)
  })

  // getRepos
  test('getRepos maps API response fields to GitHubRepo', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = makeJsonFetch({
      '/user/repos?per_page=100&sort=updated&page=1': [
        {
          full_name: 'alice/alpha',
          name: 'alpha',
          owner: { login: 'alice' },
          private: false,
          language: 'TypeScript',
          stargazers_count: 42,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    const result = await client.getRepos()

    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toEqual({
      fullName: 'alice/alpha',
      name: 'alpha',
      owner: 'alice',
      isPrivate: false,
      language: 'TypeScript',
      stargazersCount: 42,
      updatedAt: '2026-01-01T00:00:00Z',
    })

    repos.close()
    cleanupTempDir(dir)
  })

  test('getRepos combines results from multiple pages', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const makeRepo = (name: string) => ({
      full_name: `alice/${name}`,
      name,
      owner: { login: 'alice' },
      private: false,
      language: null,
      stargazers_count: 0,
      updated_at: '2026-01-01T00:00:00Z',
    })
    const fetchFn = makeJsonFetch({
      '/user/repos?per_page=100&sort=updated&page=1': [makeRepo('alpha')],
      '/user/repos?per_page=100&sort=updated&page=2': [makeRepo('beta')],
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    const result = await client.getRepos()

    expect(result.map((r) => r.fullName)).toContain('alice/alpha')
    expect(result.map((r) => r.fullName)).toContain('alice/beta')

    repos.close()
    cleanupTempDir(dir)
  })

  // getPrs
  test('getPrs maps API response including labels and draft flag', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = makeJsonFetch({
      '/repos/alice/alpha/pulls': [
        {
          number: 42,
          title: 'Fix the thing',
          draft: true,
          head: { sha: 'abc123' },
          html_url: 'https://github.com/alice/alpha/pull/42',
          user: { login: 'bob' },
          labels: [{ name: 'bug', color: 'f85149' }],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ],
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    const prs = await client.getPrs('alice/alpha')

    expect(prs).toHaveLength(1)
    expect(prs[0]).toEqual({
      number: 42,
      title: 'Fix the thing',
      draft: true,
      headSha: 'abc123',
      htmlUrl: 'https://github.com/alice/alpha/pull/42',
      creator: 'bob',
      labels: [{ name: 'bug', color: 'f85149' }],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    })

    repos.close()
    cleanupTempDir(dir)
  })

  // getLastCommitDate
  test('getLastCommitDate returns a Date from the most recent commit', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = makeJsonFetch({
      '/repos/alice/alpha/commits': [{ commit: { committer: { date: '2026-06-01T12:00:00Z' } } }],
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    const date = await client.getLastCommitDate('alice/alpha')
    expect(date).toEqual(new Date('2026-06-01T12:00:00Z'))

    repos.close()
    cleanupTempDir(dir)
  })

  test('getLastCommitDate returns null when commit list is empty', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = makeJsonFetch({ '/repos/alice/alpha/commits': [] })
    const client = createGitHubClient(repos.auth, fetchFn)

    const date = await client.getLastCommitDate('alice/alpha')
    expect(date).toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })

  test('getLastCommitDate returns null when committer is null', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = makeJsonFetch({
      '/repos/alice/alpha/commits': [{ commit: { committer: null } }],
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getLastCommitDate('alice/alpha')).toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })

  // getCiStatus — additional branches
  test('getCiStatus returns pending when any check-run is not yet completed', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = makeJsonFetch({
      '/repos/alice/alpha/commits/abc123/check-runs': {
        check_runs: [
          { status: 'completed', conclusion: 'success' },
          { status: 'in_progress', conclusion: null },
        ],
      },
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getCiStatus('alice/alpha', 'abc123')).toBe('pending')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCiStatus falls back to commit status endpoint when no check-runs exist', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = makeJsonFetch({
      '/repos/alice/alpha/commits/abc123/check-runs': { check_runs: [] },
      '/repos/alice/alpha/commits/abc123/status': { state: 'success' },
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getCiStatus('alice/alpha', 'abc123')).toBe('success')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCiStatus returns failure from commit status endpoint', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = makeJsonFetch({
      '/repos/alice/alpha/commits/abc123/check-runs': { check_runs: [] },
      '/repos/alice/alpha/commits/abc123/status': { state: 'failure' },
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getCiStatus('alice/alpha', 'abc123')).toBe('failure')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCiStatus returns pending from commit status endpoint', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = makeJsonFetch({
      '/repos/alice/alpha/commits/abc123/check-runs': { check_runs: [] },
      '/repos/alice/alpha/commits/abc123/status': { state: 'pending' },
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getCiStatus('alice/alpha', 'abc123')).toBe('pending')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCiStatus returns unknown from commit status endpoint for unrecognised state', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = makeJsonFetch({
      '/repos/alice/alpha/commits/abc123/check-runs': { check_runs: [] },
      '/repos/alice/alpha/commits/abc123/status': { state: 'error' },
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getCiStatus('alice/alpha', 'abc123')).toBe('unknown')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCiStatus returns unknown when the API call throws', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(async () => {
      throw new Error('network error')
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getCiStatus('alice/alpha', 'abc123')).toBe('unknown')

    repos.close()
    cleanupTempDir(dir)
  })

  // gfetch error handling
  test('gfetch throws when no auth token is stored', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    // intentionally no token saved
    const client = createGitHubClient(
      repos.auth,
      mock(async () => new Response('', { status: 200 })),
    )

    await expect(client.getUser()).rejects.toThrow('Not authenticated')

    repos.close()
    cleanupTempDir(dir)
  })

  test('gfetch throws on 401 response', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_expired', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(async () => new Response('', { status: 401 }))
    const client = createGitHubClient(repos.auth, fetchFn)

    await expect(client.getUser()).rejects.toThrow('Token ungültig (401)')

    repos.close()
    cleanupTempDir(dir)
  })

  test('gfetch throws with server message on 403 response', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(
      async () =>
        new Response(JSON.stringify({ message: 'rate limit exceeded' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const client = createGitHubClient(repos.auth, fetchFn)

    await expect(client.getUser()).rejects.toThrow('rate limit exceeded')

    repos.close()
    cleanupTempDir(dir)
  })

  test('gfetch throws with fallback message on 403 when body has no message field', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(
      async () =>
        new Response(JSON.stringify({}), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const client = createGitHubClient(repos.auth, fetchFn)

    await expect(client.getUser()).rejects.toThrow('Zugriff verweigert (403)')

    repos.close()
    cleanupTempDir(dir)
  })

  test('gfetch throws with API message on non-ok response', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(
      async () =>
        new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const client = createGitHubClient(repos.auth, fetchFn)

    await expect(client.getUser()).rejects.toThrow('Not Found')

    repos.close()
    cleanupTempDir(dir)
  })

  test('gfetch throws with fallback status message on non-ok response with no body message', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(async () => new Response('', { status: 500 }))
    const client = createGitHubClient(repos.auth, fetchFn)

    await expect(client.getUser()).rejects.toThrow('API-Fehler 500')

    repos.close()
    cleanupTempDir(dir)
  })
})
