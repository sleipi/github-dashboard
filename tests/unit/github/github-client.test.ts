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

  // Replace getDependabotCount tests with getDependabotAlerts
  test('getDependabotAlerts returns alerts array', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(
      async () =>
        new Response(
          JSON.stringify([
            {
              number: 1,
              state: 'open',
              dependency: { package: { name: 'lodash' } },
              security_advisory: { summary: 'Prototype Pollution', severity: 'critical' },
              html_url: 'https://github.com/alice/alpha/security/dependabot/1',
              created_at: '2026-06-20T08:00:00Z',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    const client = createGitHubClient(repos.auth, fetchFn)

    const alerts = await client.getDependabotAlerts('alice/alpha')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.packageName).toBe('lodash')
    expect(alerts[0]?.summary).toBe('Prototype Pollution')
    expect(alerts[0]?.htmlUrl).toBe('https://github.com/alice/alpha/security/dependabot/1')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getDependabotAlerts returns empty array on 403', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(async () => new Response('{}', { status: 403 }))
    const client = createGitHubClient(repos.auth, fetchFn)

    expect(await client.getDependabotAlerts('alice/alpha')).toEqual([])

    repos.close()
    cleanupTempDir(dir)
  })

  // getRepoEvents
  test('getRepoEvents returns events on 200', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const event = {
      id: 'evt_001',
      type: 'PullRequestEvent',
      actor: { login: 'bob' },
      payload: {
        action: 'closed',
        pull_request: {
          number: 42,
          title: 'Fix bug',
          merged: true,
          html_url: 'https://github.com/alice/alpha/pull/42',
        },
      },
      repo: { name: 'alice/alpha' },
      created_at: '2026-06-20T10:00:00Z',
    }
    const fetchFn = mock(
      async () =>
        new Response(JSON.stringify([event]), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: '"abc123"',
            'X-Poll-Interval': '60',
          },
        }),
    )
    const client = createGitHubClient(repos.auth, fetchFn)

    const result = await client.getRepoEvents('alice/alpha')
    expect('notModified' in result).toBe(false)
    if ('notModified' in result) return
    expect(result.etag).toBe('"abc123"')
    expect(result.pollIntervalSecs).toBe(60)
    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.id).toBe('evt_001')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getRepoEvents returns notModified on 304', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(async () => new Response('', { status: 304 }))
    const client = createGitHubClient(repos.auth, fetchFn)

    const result = await client.getRepoEvents('alice/alpha', '"abc123"')
    expect(result).toEqual({ notModified: true })

    repos.close()
    cleanupTempDir(dir)
  })

  test('getRepoEvents sends If-None-Match header when etag provided', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    let capturedHeaders: Headers | undefined
    const fetchFn = mock(async (_url: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit)
      return new Response('', { status: 304 })
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    await client.getRepoEvents('alice/alpha', '"myetag"')
    expect(capturedHeaders?.get('If-None-Match')).toBe('"myetag"')

    repos.close()
    cleanupTempDir(dir)
  })

  test('searchRepos maps GitHub Search API items to GitHubRepo', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = makeJsonFetch({
      '/search/repositories': {
        total_count: 1,
        items: [
          {
            full_name: 'jtl-software/old-repo',
            name: 'old-repo',
            owner: { login: 'jtl-software' },
            private: true,
            language: 'Go',
            stargazers_count: 5,
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      },
    })
    const client = createGitHubClient(repos.auth, fetchFn)

    const result = await client.searchRepos('old')

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      fullName: 'jtl-software/old-repo',
      name: 'old-repo',
      owner: 'jtl-software',
      isPrivate: true,
      language: 'Go',
      stargazersCount: 5,
      updatedAt: '2024-01-01T00:00:00Z',
    })

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

  test('getUser returns expiresAt when GitHub-Authentication-Token-Expiration header present', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(
      async () =>
        new Response(JSON.stringify({ login: 'alice', avatar_url: 'https://x.com/a.png' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'GitHub-Authentication-Token-Expiration': '2026-12-31 21:01:12 UTC',
          },
        }),
    )
    const client = createGitHubClient(repos.auth, fetchFn)

    const user = await client.getUser()
    expect(user.expiresAt).toBeInstanceOf(Date)
    expect(user.expiresAt?.toISOString()).toBe('2026-12-31T21:01:12.000Z')

    repos.close()
    cleanupTempDir(dir)
  })

  test('getUser returns null expiresAt when header is absent', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-client-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

    const fetchFn = mock(
      async () =>
        new Response(JSON.stringify({ login: 'alice', avatar_url: 'https://x.com/a.png' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const client = createGitHubClient(repos.auth, fetchFn)

    const user = await client.getUser()
    expect(user.expiresAt).toBeNull()

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

    await expect(client.getUser()).rejects.toThrow('Invalid token (401)')

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

    await expect(client.getUser()).rejects.toThrow('Access denied (403)')

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

    await expect(client.getUser()).rejects.toThrow('API error 500')

    repos.close()
    cleanupTempDir(dir)
  })
})
