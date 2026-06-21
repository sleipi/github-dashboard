import { describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { PullRequest } from '../../../src/db/types.ts'
import { createPrRoutes } from '../../../src/routes/pr-route.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

const makePr = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  repoFullName: 'alice/alpha',
  number: 1,
  title: 'Fix the thing',
  draft: false,
  ciStatus: 'success',
  prUrl: 'https://github.com/alice/alpha/pull/1',
  creator: 'bob',
  labels: [],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  ...overrides,
})

describe('PR routes', () => {
  test('GET /api/prs/owner/repo returns HTML PR modal for the repo', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-route-')
    const repos = createSqliteRepos(dbPath)
    repos.pullRequests.upsertPrs('alice/alpha', [makePr({ number: 42, title: 'Fix the bug' })])
    const routes = createPrRoutes(repos.pullRequests)

    const url = new URL('http://localhost:4242/api/prs/alice/alpha')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(body).toContain('Fix the bug')
    expect(body).toContain('#42')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/prs/owner/repo returns modal with fullName when no PRs exist', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-route-')
    const repos = createSqliteRepos(dbPath)
    const routes = createPrRoutes(repos.pullRequests)

    const url = new URL('http://localhost:4242/api/prs/alice/alpha')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('alice/alpha')

    repos.close()
    cleanupTempDir(dir)
  })

  test('route only matches GET requests with two path segments after /api/prs/', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-route-')
    const repos = createSqliteRepos(dbPath)
    const routes = createPrRoutes(repos.pullRequests)

    const postUrl = new URL('http://localhost:4242/api/prs/alice/alpha')
    expect(routes.some((r) => r.match(postUrl, 'POST'))).toBe(false)

    const tooShort = new URL('http://localhost:4242/api/prs/alice')
    expect(routes.some((r) => r.match(tooShort, 'GET'))).toBe(false)

    repos.close()
    cleanupTempDir(dir)
  })
})
