import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { GitHubClient, GitHubRepo } from '../../../src/github/github-client.ts'
import { createModalRoutes } from '../../../src/routes/modal-route.ts'
import { createCardService } from '../../../src/services/card-service.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

const makeRepo = (fullName: string): GitHubRepo => {
  const [owner, name] = fullName.split('/') as [string, string]
  return {
    fullName,
    name,
    owner,
    isPrivate: false,
    language: 'TypeScript',
    stargazersCount: 0,
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt: null })),
    getRepos: mock(async () => [makeRepo('alice/alpha'), makeRepo('alice/beta')]),
    searchRepos: mock(async () => []),
    getUserOrgs: mock(async () => []),
    getPrs: mock(async () => []),
    getLastCommitDate: mock(async () => null),
    getCiStatus: mock(async () => 'unknown' as const),
    getRepoEvents: mock(async () => ({ notModified: true as const })),
    getDependabotAlerts: mock(async () => []),
    ...overrides,
  }
}

describe('modal routes', () => {
  test('GET /api/modal/repos returns HTML with the repo list', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(service, repos.cards, makeClient(), repos.auth)

    const url = new URL('http://localhost:4242/api/modal/repos')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(body).toContain('alice/alpha')
    expect(body).toContain('alice/beta')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/modal/repos marks already-pinned repos with data-checked=1', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    repos.cards.pin('alice/alpha')
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(service, repos.cards, makeClient(), repos.auth)

    const url = new URL('http://localhost:4242/api/modal/repos')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(body).toContain('data-checked="1"')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/modal/repos does not match other methods or paths', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(service, repos.cards, makeClient(), repos.auth)

    const otherUrl = new URL('http://localhost:4242/api/modal/other')
    expect(routes.some((r) => r.match(otherUrl, 'GET'))).toBe(false)
    const correctUrl = new URL('http://localhost:4242/api/modal/repos')
    expect(routes.some((r) => r.match(correctUrl, 'POST'))).toBe(false)

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/repos/search with q>=2 calls searchRepos and returns HTML rows', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    const searchRepos = mock(async () => [makeRepo('jtl-software/old-archive')])
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(service, repos.cards, makeClient({ searchRepos }), repos.auth)

    const url = new URL('http://localhost:4242/api/repos/search?q=old')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(searchRepos).toHaveBeenCalledWith('old')
    expect(body).toContain('jtl-software/old-archive')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/repos/search with q<2 falls back to getAllRepos', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    const getRepos = mock(async () => [makeRepo('alice/alpha')])
    const searchRepos = mock(async () => [])
    const service = createCardService(repos, makeClient({ getRepos }))
    const routes = createModalRoutes(service, repos.cards, makeClient({ searchRepos }), repos.auth)

    const url = new URL('http://localhost:4242/api/repos/search?q=a')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(searchRepos).not.toHaveBeenCalled()
    expect(body).toContain('alice/alpha')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/repos/search returns empty response when searchRepos throws', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())
    const throwingClient = {
      ...makeClient(),
      searchRepos: mock(async () => {
        throw new Error('rate limited')
      }),
    }
    const routes = createModalRoutes(service, repos.cards, throwingClient, repos.auth)
    const url = new URL('http://localhost:4242/api/repos/search?q=ab')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toBe('')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/modal/repos renders scope label with username and orgs when global search is off', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    const getUserOrgs = mock(async () => ['jtl-software'])
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(service, repos.cards, makeClient({ getUserOrgs }), repos.auth)

    const url = new URL('http://localhost:4242/api/modal/repos')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(body).toContain('searching in alice / jtl-software')
    expect(body).toContain('aria-pressed="false"')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/modal/repos renders global scope label when global search is on', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    repos.globalSearch.setEnabled(true)
    const getUserOrgs = mock(async () => ['jtl-software'])
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(service, repos.cards, makeClient({ getUserOrgs }), repos.auth)

    const url = new URL('http://localhost:4242/api/modal/repos')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(body).toContain('searching all of GitHub')
    expect(body).toContain('aria-pressed="true"')
    expect(getUserOrgs).not.toHaveBeenCalled()

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/repos/search scopes the query to user + orgs by default', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    const getUserOrgs = mock(async () => ['jtl-software'])
    const searchRepos = mock(async () => [])
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(
      service,
      repos.cards,
      makeClient({ getUserOrgs, searchRepos }),
      repos.auth,
    )

    const url = new URL('http://localhost:4242/api/repos/search?q=old')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    await route.handle(new Request(url.href), url)

    expect(searchRepos).toHaveBeenCalledWith('old user:alice org:jtl-software')

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/repos/search sends the raw query when global search is enabled', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    repos.globalSearch.setEnabled(true)
    const getUserOrgs = mock(async () => ['jtl-software'])
    const searchRepos = mock(async () => [])
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(
      service,
      repos.cards,
      makeClient({ getUserOrgs, searchRepos }),
      repos.auth,
    )

    const url = new URL('http://localhost:4242/api/repos/search?q=old')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    await route.handle(new Request(url.href), url)

    expect(searchRepos).toHaveBeenCalledWith('old')
    expect(getUserOrgs).not.toHaveBeenCalled()

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/repos/search falls back to user-only scope when org fetch fails', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    const getUserOrgs = mock(async () => {
      throw new Error('missing read:org scope')
    })
    const searchRepos = mock(async () => [])
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(
      service,
      repos.cards,
      makeClient({ getUserOrgs, searchRepos }),
      repos.auth,
    )

    const url = new URL('http://localhost:4242/api/repos/search?q=old')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')
    await route.handle(new Request(url.href), url)

    expect(searchRepos).toHaveBeenCalledWith('old user:alice')

    repos.close()
    cleanupTempDir(dir)
  })

  test('POST /api/settings/global-search flips the setting and re-renders scope + results', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(service, repos.cards, makeClient(), repos.auth)

    const url = new URL('http://localhost:4242/api/settings/global-search')
    const route = routes.find((r) => r.match(url, 'POST'))
    if (!route) throw new Error('route not found')
    const form = new URLSearchParams({ q: '' })
    const res = await route.handle(
      new Request(url.href, {
        method: 'POST',
        body: form,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
      url,
    )
    const body = await res.text()

    expect(repos.globalSearch.isEnabled()).toBe(true)
    expect(body).toContain('searching all of GitHub')
    expect(body).toContain('aria-pressed="true"')

    repos.close()
    cleanupTempDir(dir)
  })

  test('POST /api/settings/global-search rebuilds results using the included q value', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    const searchRepos = mock(async () => [makeRepo('jtl-software/global-hit')])
    const service = createCardService(repos, makeClient())
    const routes = createModalRoutes(service, repos.cards, makeClient({ searchRepos }), repos.auth)

    const url = new URL('http://localhost:4242/api/settings/global-search')
    const route = routes.find((r) => r.match(url, 'POST'))
    if (!route) throw new Error('route not found')
    const form = new URLSearchParams({ q: 'hit' })
    const res = await route.handle(
      new Request(url.href, {
        method: 'POST',
        body: form,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
      url,
    )
    const body = await res.text()

    expect(searchRepos).toHaveBeenCalledWith('hit')
    expect(body).toContain('jtl-software/global-hit')

    repos.close()
    cleanupTempDir(dir)
  })
})
