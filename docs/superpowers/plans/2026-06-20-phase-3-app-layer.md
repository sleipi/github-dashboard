# GitHub Dashboard — Phase 3: App-Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub API Client, Services, HTML-Templates und HTTP-Routes implementieren. Am Ende läuft ein vollständig funktionierendes lokales Dashboard.

**Architecture:** GitHub Client → Card Service → Route Handler → Template → Response. Alle Abhängigkeiten werden via Parameter injiziert. Templates sind pure Funktionen (string in, string out).

**Tech Stack:** Bun.serve, HTMX (CDN), TypeScript, bun:test

## Global Constraints

- `fetchFn` wird in den GitHub Client injiziert (Testbarkeit)
- SQLite-Cache-TTL für Repo-Daten: 30 Sekunden (Konstante im Service)
- CI-Status wird für max. 3 PRs pro Repo geprüft (Rate-Limit-Schutz)
- Client-side Modal-Suche via Vanilla JS (kein Such-Endpoint)
- Kein `Co-Authored-By: Claude` in Commit-Messages

---

## File Map

```
src/
  github/
    github-client.ts          ← Interface + Typen + createGitHubClient()
  services/
    card-service.ts           ← createCardService() — orchestriert Repos + Client
    dependabot-service.ts     ← calculateTrend() — pure function
  templates/
    types.ts                  ← CardViewModel, PrRowViewModel, etc.
    formatters.ts             ← formatRelative, ciColor, depColor, formatTrend
    styles.ts                 ← DASHBOARD_CSS (inline string)
    page-template.ts          ← renderPage(token | null): string
    card-template.ts          ← renderCards(), renderCard()
    modal-template.ts         ← renderRepoModal()
    pr-modal-template.ts      ← renderPrModal()
  routes/
    route-handler.ts          ← RouteHandler interface
    auth-route.ts             ← POST /api/auth, DELETE /api/auth
    card-route.ts             ← GET /, GET /api/cards, GET /api/card/:owner/:repo,
                                 POST /api/cards/:owner/:repo, POST /api/cards/reorder
    modal-route.ts            ← GET /api/modal/repos
    pr-route.ts               ← GET /api/prs/:owner/:repo
  server.ts                   ← startServer(port, routes)
  index.ts                    ← Composition root

tests/unit/
  github/
    github-client.test.ts
  services/
    card-service.test.ts
    dependabot-service.test.ts
  templates/
    formatters.test.ts
    card-template.test.ts
  routes/
    auth-route.test.ts
    card-route.test.ts
```

---

### Task 9: GitHub Client

**Files:**
- Create: `src/github/github-client.ts`
- Create: `tests/unit/github/github-client.test.ts`

**Interfaces:**
- Consumes: `AuthRepo` aus Phase 2
- Produces: `GitHubClient` interface, `GitHubRepo`, `GitHubPr`, `GitHubUser` types, `createGitHubClient(authRepo, fetchFn?): GitHubClient`

- [ ] **Step 1: GitHub Client schreiben**

```typescript
// src/github/github-client.ts
import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { CiStatus, Label } from '../db/types.ts'

export type GitHubUser = {
  readonly login: string
  readonly avatarUrl: string
}

export type GitHubRepo = {
  readonly fullName: string
  readonly name: string
  readonly owner: string
  readonly isPrivate: boolean
  readonly language: string | null
  readonly stargazersCount: number
  readonly updatedAt: string
}

export type GitHubPr = {
  readonly number: number
  readonly title: string
  readonly draft: boolean
  readonly headSha: string
  readonly htmlUrl: string
  readonly creator: string
  readonly labels: ReadonlyArray<Label>
  readonly createdAt: string
  readonly updatedAt: string
}

export interface GitHubClient {
  getUser(): Promise<GitHubUser>
  getRepos(): Promise<GitHubRepo[]>
  getPrs(fullName: string): Promise<GitHubPr[]>
  getLastCommitDate(fullName: string): Promise<Date | null>
  getCiStatus(fullName: string, sha: string): Promise<CiStatus>
  getDependabotCount(fullName: string): Promise<number | null>
}

export function createGitHubClient(
  authRepo: AuthRepo,
  fetchFn: typeof fetch = globalThis.fetch,
): GitHubClient {
  async function gfetch(path: string): Promise<unknown> {
    const token = authRepo.getToken()
    if (!token) throw new Error('Not authenticated')
    const res = await fetchFn(`https://api.github.com${path}`, {
      headers: {
        Authorization: `token ${token.pat}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })
    if (res.status === 401) throw new Error('Token ungültig (401)')
    if (res.status === 403) {
      const j = await res.json().catch(() => ({})) as { message?: string }
      throw new Error(j.message ?? 'Zugriff verweigert (403)')
    }
    if (!res.ok) throw new Error(`API-Fehler ${res.status}`)
    return res.json()
  }

  return {
    async getUser() {
      const d = (await gfetch('/user')) as { login: string; avatar_url: string }
      return { login: d.login, avatarUrl: d.avatar_url }
    },

    async getRepos() {
      const pages = await Promise.all([
        gfetch('/user/repos?per_page=100&sort=updated&page=1') as Promise<unknown[]>,
        gfetch('/user/repos?per_page=100&sort=updated&page=2').catch(() => []) as Promise<unknown[]>,
        gfetch('/user/repos?per_page=100&sort=updated&page=3').catch(() => []) as Promise<unknown[]>,
      ])
      return pages
        .flat()
        .map((r) => {
          const repo = r as {
            full_name: string; name: string
            owner: { login: string }; private: boolean
            language: string | null; stargazers_count: number; updated_at: string
          }
          return {
            fullName: repo.full_name,
            name: repo.name,
            owner: repo.owner.login,
            isPrivate: repo.private,
            language: repo.language,
            stargazersCount: repo.stargazers_count,
            updatedAt: repo.updated_at,
          }
        })
    },

    async getPrs(fullName) {
      const data = (await gfetch(
        `/repos/${fullName}/pulls?state=open&per_page=30&sort=updated`,
      )) as Array<{
        number: number; title: string; draft: boolean
        head: { sha: string }; html_url: string
        user: { login: string }
        labels: Array<{ name: string; color: string }>
        created_at: string; updated_at: string
      }>
      return data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        draft: !!pr.draft,
        headSha: pr.head.sha,
        htmlUrl: pr.html_url,
        creator: pr.user.login,
        labels: pr.labels.map((l) => ({ name: l.name, color: l.color })),
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      }))
    },

    async getLastCommitDate(fullName) {
      const data = (await gfetch(
        `/repos/${fullName}/commits?per_page=1`,
      )) as Array<{ commit: { committer: { date: string } | null } }>
      const date = data[0]?.commit?.committer?.date
      return date ? new Date(date) : null
    },

    async getCiStatus(fullName, sha) {
      try {
        const cr = (await gfetch(`/repos/${fullName}/commits/${sha}/check-runs`)) as {
          check_runs: Array<{ status: string; conclusion: string | null }>
        }
        const runs = cr.check_runs
        if (runs.length === 0) {
          const st = (await gfetch(`/repos/${fullName}/commits/${sha}/status`)) as { state: string }
          if (st.state === 'success') return 'success'
          if (st.state === 'failure') return 'failure'
          if (st.state === 'pending') return 'pending'
          return 'unknown'
        }
        if (!runs.every((r) => r.status === 'completed')) return 'pending'
        const failed = ['failure', 'timed_out', 'cancelled', 'action_required']
        if (runs.some((r) => r.conclusion && failed.includes(r.conclusion))) return 'failure'
        return 'success'
      } catch {
        return 'unknown'
      }
    },

    async getDependabotCount(fullName) {
      try {
        const alerts = (await gfetch(
          `/repos/${fullName}/dependabot/alerts?state=open&per_page=100`,
        )) as unknown[]
        return Array.isArray(alerts) ? alerts.length : null
      } catch {
        return null
      }
    },
  }
}
```

- [ ] **Step 2: Test schreiben**

```typescript
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
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '' })

    const fetchFn = makeJsonFetch({ '/user': { login: 'alice', avatar_url: 'https://x.com/a.png' } })
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
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '' })

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
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '' })

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
```

- [ ] **Step 3: Tests ausführen**

```bash
bun test tests/unit/github/
```

Erwartete Ausgabe: 4 passing tests.

- [ ] **Step 4: Commit**

```bash
git add src/github/ tests/unit/github/
git commit -m "feat(github): add GitHub API client with injectable fetch"
```

---

### Task 10: Card Service + Dependabot Service

**Files:**
- Create: `src/services/dependabot-service.ts`
- Create: `src/services/card-service.ts`
- Create: `tests/unit/services/dependabot-service.test.ts`
- Create: `tests/unit/services/card-service.test.ts`

**Interfaces:**
- Consumes: `Repos` (Phase 2), `GitHubClient` (Task 9)
- Produces: `CardData`, `CardService`, `createCardService()`, `calculateTrend()`

- [ ] **Step 1: Dependabot Service schreiben (pure function)**

```typescript
// src/services/dependabot-service.ts
import type { DependabotSnapshot, DependabotTrend } from '../db/types.ts'

export function calculateTrend(history: DependabotSnapshot[], now: Date): DependabotTrend {
  if (history.length === 0) return { week: null, month: null, sixMonths: null }

  const latest = history[history.length - 1]
  if (!latest) return { week: null, month: null, sixMonths: null }
  const current = latest.count
  const nowMs = now.getTime()

  function findClosest(targetMs: number, minAgeMs: number): number | null {
    let best: DependabotSnapshot | null = null
    let bestDiff = Infinity
    for (const snap of history) {
      const age = nowMs - snap.recordedAt.getTime()
      if (age < minAgeMs) continue
      const diff = Math.abs(snap.recordedAt.getTime() - targetMs)
      if (diff < bestDiff) {
        bestDiff = diff
        best = snap
      }
    }
    return best !== null ? current - best.count : null
  }

  const DAY = 86_400_000
  return {
    week: findClosest(nowMs - 7 * DAY, 3 * DAY),
    month: findClosest(nowMs - 30 * DAY, 14 * DAY),
    sixMonths: findClosest(nowMs - 183 * DAY, 60 * DAY),
  }
}
```

- [ ] **Step 2: Dependabot Service testen**

```typescript
// tests/unit/services/dependabot-service.test.ts
import { describe, expect, test } from 'bun:test'
import { calculateTrend } from '../../../src/services/dependabot-service.ts'
import type { DependabotSnapshot } from '../../../src/db/types.ts'

const snap = (daysAgo: number, count: number, now: Date): DependabotSnapshot => ({
  repoFullName: 'alice/alpha',
  count,
  recordedAt: new Date(now.getTime() - daysAgo * 86_400_000),
})

describe('calculateTrend', () => {
  const now = new Date('2026-06-20T12:00:00Z')

  test('returns all null for empty history', () => {
    const trend = calculateTrend([], now)
    expect(trend).toEqual({ week: null, month: null, sixMonths: null })
  })

  test('returns null for week when history is too recent (< 3 days)', () => {
    const history = [snap(1, 5, now), snap(0, 7, now)]
    const trend = calculateTrend(history, now)
    expect(trend.week).toBeNull()
  })

  test('calculates positive weekly delta', () => {
    const history = [snap(8, 3, now), snap(0, 7, now)]
    const trend = calculateTrend(history, now)
    expect(trend.week).toBe(4) // 7 - 3
  })

  test('calculates negative monthly delta', () => {
    const history = [snap(31, 10, now), snap(0, 6, now)]
    const trend = calculateTrend(history, now)
    expect(trend.month).toBe(-4) // 6 - 10
  })
})
```

```bash
bun test tests/unit/services/dependabot-service.test.ts
```

Erwartete Ausgabe: 4 passing tests.

- [ ] **Step 3: Card Service schreiben**

```typescript
// src/services/card-service.ts
import type { Repos } from '../db/repos.ts'
import type { PullRequest, DependabotTrend, RepoCache } from '../db/types.ts'
import type { GitHubClient, GitHubRepo } from '../github/github-client.ts'
import { calculateTrend } from './dependabot-service.ts'

const CACHE_TTL_MS = 30_000 // 30 Sekunden
const MAX_CI_CHECKS = 3     // CI nur für die ersten 3 PRs prüfen
const DEP_INTERVAL_MS = 30 * 60 * 1000 // Dependabot-Snapshot alle 30 Min
const DEP_PRUNE_DAYS = 183

export type CardData = {
  readonly fullName: string
  readonly cache: RepoCache
  readonly prs: ReadonlyArray<PullRequest>
  readonly trend: DependabotTrend
}

export type CardService = {
  getCard(fullName: string): Promise<CardData>
  getCards(): Promise<CardData[]>
  getAllRepos(): Promise<GitHubRepo[]>
  togglePin(fullName: string): boolean
  reorder(fullNames: string[]): void
}

export function createCardService(repos: Repos, client: GitHubClient): CardService {
  async function fetchAndCache(fullName: string): Promise<void> {
    const now = new Date()
    const [githubPrs, lastCommitAt, depCount] = await Promise.all([
      client.getPrs(fullName),
      client.getLastCommitDate(fullName),
      client.getDependabotCount(fullName),
    ])

    // CI für die ersten MAX_CI_CHECKS PRs
    const prsWithCi = await Promise.all(
      githubPrs.slice(0, MAX_CI_CHECKS).map(async (pr) => ({
        repoFullName: fullName,
        number: pr.number,
        title: pr.title,
        draft: pr.draft,
        ciStatus: await client.getCiStatus(fullName, pr.headSha),
        prUrl: pr.htmlUrl,
        creator: pr.creator,
        labels: pr.labels,
        createdAt: new Date(pr.createdAt),
        updatedAt: new Date(pr.updatedAt),
      })),
    )

    // Restliche PRs ohne CI-Check
    const prsRest: PullRequest[] = githubPrs.slice(MAX_CI_CHECKS).map((pr) => ({
      repoFullName: fullName,
      number: pr.number,
      title: pr.title,
      draft: pr.draft,
      ciStatus: 'unknown' as const,
      prUrl: pr.htmlUrl,
      creator: pr.creator,
      labels: pr.labels,
      createdAt: new Date(pr.createdAt),
      updatedAt: new Date(pr.updatedAt),
    }))

    repos.pullRequests.upsertPrs(fullName, [...prsWithCi, ...prsRest])
    repos.pullRequests.upsertCache(fullName, {
      lastCommitAt,
      prTotal: githubPrs.length,
      dependabotCount: depCount,
    })

    if (depCount !== null) {
      repos.dependabot.maybeRecordSnapshot(fullName, depCount, now, DEP_INTERVAL_MS)
      repos.dependabot.pruneOld(DEP_PRUNE_DAYS, now)
    }
  }

  async function getCard(fullName: string): Promise<CardData> {
    const cached = repos.pullRequests.getCache(fullName)
    const isStale =
      !cached || Date.now() - cached.cachedAt.getTime() > CACHE_TTL_MS

    if (isStale) await fetchAndCache(fullName)

    const cache = repos.pullRequests.getCache(fullName)!
    const prs = repos.pullRequests.getPrs(fullName)
    const history = repos.dependabot.getHistory(fullName)
    const trend = calculateTrend(history, new Date())

    return { fullName, cache, prs, trend }
  }

  return {
    getCard,

    async getCards() {
      const pinned = repos.cards.getPinned()
      return Promise.all(pinned.map((p) => getCard(p.fullName)))
    },

    async getAllRepos() {
      return client.getRepos()
    },

    togglePin(fullName) {
      if (repos.cards.isPinned(fullName)) {
        repos.cards.unpin(fullName)
        return false
      }
      repos.cards.pin(fullName)
      return true
    },

    reorder(fullNames) {
      repos.cards.reorder(fullNames)
    },
  }
}
```

- [ ] **Step 4: Card Service testen**

```typescript
// tests/unit/services/card-service.test.ts
import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { GitHubClient } from '../../../src/github/github-client.ts'
import { createCardService } from '../../../src/services/card-service.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: '' })),
    getRepos: mock(async () => []),
    getPrs: mock(async () => []),
    getLastCommitDate: mock(async () => null),
    getCiStatus: mock(async () => 'unknown' as const),
    getDependabotCount: mock(async () => null),
    ...overrides,
  }
}

describe('CardService', () => {
  test('getCards returns empty array when nothing is pinned', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())

    expect(await service.getCards()).toEqual([])

    repos.close()
    cleanupTempDir(dir)
  })

  test('togglePin pins a repo and returns true', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())

    const result = service.togglePin('alice/alpha')

    expect(result).toBe(true)
    expect(repos.cards.isPinned('alice/alpha')).toBe(true)

    repos.close()
    cleanupTempDir(dir)
  })

  test('togglePin unpins a pinned repo and returns false', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())

    service.togglePin('alice/alpha')
    const result = service.togglePin('alice/alpha')

    expect(result).toBe(false)
    expect(repos.cards.isPinned('alice/alpha')).toBe(false)

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard fetches from GitHub and caches in DB', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const getPrs = mock(async () => [])
    const service = createCardService(repos, makeClient({ getPrs }))

    repos.cards.pin('alice/alpha')
    await service.getCard('alice/alpha')

    expect(getPrs).toHaveBeenCalledTimes(1)
    expect(repos.pullRequests.getCache('alice/alpha')).not.toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })

  test('getCard uses cache when data is fresh (< 30s)', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-svc-')
    const repos = createSqliteRepos(dbPath)
    const getPrs = mock(async () => [])
    const service = createCardService(repos, makeClient({ getPrs }))

    repos.cards.pin('alice/alpha')
    await service.getCard('alice/alpha') // 1. Fetch
    await service.getCard('alice/alpha') // 2. Sollte Cache nutzen

    expect(getPrs).toHaveBeenCalledTimes(1) // nur einmal gefetcht
    repos.close()
    cleanupTempDir(dir)
  })
})
```

- [ ] **Step 5: Alle Service-Tests ausführen**

```bash
bun test tests/unit/services/
```

Erwartete Ausgabe: 8 passing tests (4 dependabot + 5 card).

- [ ] **Step 6: Commit**

```bash
git add src/services/ tests/unit/services/
git commit -m "feat(services): add card service with SQLite cache and dependabot trend calculation"
```

---

### Task 11: Templates — Formatters, Styles, Page, Card

**Files:**
- Create: `src/templates/types.ts`
- Create: `src/templates/formatters.ts`
- Create: `src/templates/styles.ts`
- Create: `src/templates/page-template.ts`
- Create: `src/templates/card-template.ts`
- Create: `tests/unit/templates/formatters.test.ts`
- Create: `tests/unit/templates/card-template.test.ts`

**Interfaces:**
- Consumes: `CardData` aus Task 10, `AuthToken` aus Phase 2
- Produces: `CardViewModel`, `renderPage()`, `renderCards()`, `renderCard()`

- [ ] **Step 1: ViewModel-Typen schreiben**

```typescript
// src/templates/types.ts
export type PrRowViewModel = {
  readonly number: number
  readonly title: string
  readonly draft: boolean
  readonly ciColor: string
  readonly ciLabel: string
  readonly prUrl: string
}

export type CardViewModel = {
  readonly fullName: string
  readonly owner: string
  readonly name: string
  readonly repoUrl: string
  readonly securityUrl: string
  readonly lastCommit: string       // "vor 2 Std." oder "—"
  readonly ciDotColor: string
  readonly ciDotLabel: string
  readonly showCiDot: boolean
  readonly depDisplay: string       // "5" oder "—"
  readonly depColor: string
  readonly depLabel: string
  readonly depTrend: string         // "(+2, -1)" oder ""
  readonly hasDepTrend: boolean
  readonly depCollecting: boolean
  readonly prs: ReadonlyArray<PrRowViewModel>
  readonly hasPrs: boolean
  readonly noPrs: boolean
  readonly prTotal: number
  readonly prMore: number
  readonly hasMore: boolean
  readonly prMoreLabel: string
}

export type RepoListItemViewModel = {
  readonly fullName: string
  readonly name: string
  readonly owner: string
  readonly isPinned: boolean
  readonly isPrivate: boolean
  readonly language: string | null
  readonly starsDisplay: string | null
  readonly updatedAt: string
}
```

- [ ] **Step 2: Formatter-Funktionen schreiben**

```typescript
// src/templates/formatters.ts
import type { CiStatus, DependabotTrend } from '../db/types.ts'

export function formatRelative(date: Date | null, now: Date = new Date()): string {
  if (!date) return '—'
  const s = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (s < 60) return 'Gerade eben'
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`
  const days = Math.floor(s / 86400)
  if (days < 30) return `vor ${days} Tag${days === 1 ? '' : 'en'}`
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })
}

const CI_COLOR: Record<CiStatus, string> = {
  success: '#3fb950',
  failure: '#f85149',
  pending: '#d29922',
  unknown: '#8b949e',
}

const CI_LABEL: Record<CiStatus, string> = {
  success: 'CI: erfolgreich',
  failure: 'CI: fehlgeschlagen',
  pending: 'CI: läuft…',
  unknown: 'Kein CI',
}

export function ciColor(status: CiStatus): string {
  return CI_COLOR[status]
}

export function ciLabel(status: CiStatus): string {
  return CI_LABEL[status]
}

export function aggregateCiStatus(statuses: CiStatus[]): CiStatus | null {
  if (statuses.length === 0) return null
  if (statuses.some((s) => s === 'failure')) return 'failure'
  if (statuses.some((s) => s === 'pending')) return 'pending'
  if (statuses.every((s) => s === 'success')) return 'success'
  return 'unknown'
}

export function depColor(count: number | null): string {
  if (count === null) return '#6e7681'
  if (count === 0) return '#3fb950'
  if (count > 5) return '#f85149'
  return '#d29922'
}

export function formatTrend(trend: DependabotTrend): string {
  const parts: string[] = []
  if (trend.week !== null) parts.push((trend.week > 0 ? '+' : '') + trend.week)
  if (trend.month !== null) parts.push((trend.month > 0 ? '+' : '') + trend.month)
  if (trend.sixMonths !== null) parts.push((trend.sixMonths > 0 ? '+' : '') + trend.sixMonths)
  return parts.length ? `(${parts.join(', ')})` : ''
}
```

- [ ] **Step 3: Formatter-Tests schreiben**

```typescript
// tests/unit/templates/formatters.test.ts
import { describe, expect, test } from 'bun:test'
import {
  aggregateCiStatus,
  ciColor,
  depColor,
  formatRelative,
  formatTrend,
} from '../../../src/templates/formatters.ts'

const now = new Date('2026-06-20T12:00:00Z')

describe('formatRelative', () => {
  test('returns "Gerade eben" for < 60s', () => {
    expect(formatRelative(new Date(now.getTime() - 30_000), now)).toBe('Gerade eben')
  })
  test('returns minutes for < 1h', () => {
    expect(formatRelative(new Date(now.getTime() - 5 * 60_000), now)).toBe('vor 5 Min.')
  })
  test('returns hours for < 24h', () => {
    expect(formatRelative(new Date(now.getTime() - 3 * 3_600_000), now)).toBe('vor 3 Std.')
  })
  test('returns "—" for null', () => {
    expect(formatRelative(null, now)).toBe('—')
  })
})

describe('aggregateCiStatus', () => {
  test('returns null for empty array', () => {
    expect(aggregateCiStatus([])).toBeNull()
  })
  test('failure takes priority over success', () => {
    expect(aggregateCiStatus(['success', 'failure', 'pending'])).toBe('failure')
  })
  test('pending takes priority over unknown', () => {
    expect(aggregateCiStatus(['unknown', 'pending'])).toBe('pending')
  })
  test('all success returns success', () => {
    expect(aggregateCiStatus(['success', 'success'])).toBe('success')
  })
})

describe('formatTrend', () => {
  test('formats positive and negative deltas', () => {
    expect(formatTrend({ week: 2, month: -1, sixMonths: null })).toBe('(+2, -1)')
  })
  test('returns empty string when all null', () => {
    expect(formatTrend({ week: null, month: null, sixMonths: null })).toBe('')
  })
})

describe('depColor', () => {
  test('green for 0 alerts', () => { expect(depColor(0)).toBe('#3fb950') })
  test('red for > 5 alerts', () => { expect(depColor(6)).toBe('#f85149') })
  test('gray for null', () => { expect(depColor(null)).toBe('#6e7681') })
})
```

```bash
bun test tests/unit/templates/formatters.test.ts
```

Erwartete Ausgabe: 10 passing tests.

- [ ] **Step 4: Styles schreiben**

```typescript
// src/templates/styles.ts
export const DASHBOARD_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 14px; background: #0d1117; color: #e6edf3; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0d1117; }
  ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
  @keyframes shimmer { 0%,100%{opacity:.3} 50%{opacity:.7} }
  @keyframes spin { to { transform: rotate(360deg); } }
  .card { background: #161b22; border-radius: 8px; overflow: hidden; user-select: none;
    transition: border-color .4s, box-shadow .4s; border: 1.5px solid #30363d; }
  .card:hover { box-shadow: 0 4px 24px rgba(0,0,0,.55); }
  .card-header { padding: 10px 13px; border-bottom: 1px solid #21262d;
    display: flex; align-items: center; gap: 6px; }
  .card-body { padding: 11px 13px; }
  .skeleton { height: 10px; background: #21262d; border-radius: 3px;
    animation: shimmer 1.6s ease-in-out infinite; }
  .pr-row { display: flex; align-items: center; gap: 7px; padding: 4px 5px;
    border-radius: 4px; text-decoration: none; color: inherit; }
  .pr-row:hover { background: #21262d; }
  .ci-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .badge { font-size: 10px; background: #21262d; color: #8b949e; border-radius: 20px; padding: 1px 7px; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(1,4,9,.85);
    backdrop-filter: blur(4px); z-index: 200; display: flex;
    align-items: flex-start; justify-content: center; padding: 64px 16px 16px; }
  .modal { background: #161b22; border: 1px solid #30363d; border-radius: 10px;
    width: 100%; max-width: 560px; max-height: calc(100vh - 130px);
    display: flex; flex-direction: column; overflow: hidden; }
  .btn-primary { background: #238636; border: 1px solid #2ea043; border-radius: 6px;
    padding: 5px 14px; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; }
  .btn-primary:hover { background: #2ea043; }
  .btn-ghost { background: transparent; border: 1px solid #30363d; border-radius: 6px;
    padding: 5px 12px; color: #8b949e; font-size: 12px; cursor: pointer; }
  .btn-ghost:hover { background: #21262d; color: #e6edf3; }
`
```

- [ ] **Step 5: Card Template + ViewModel-Builder schreiben**

```typescript
// src/templates/card-template.ts
import type { CardData } from '../services/card-service.ts'
import type { CiStatus } from '../db/types.ts'
import {
  aggregateCiStatus, ciColor, ciLabel, depColor,
  formatRelative, formatTrend,
} from './formatters.ts'
import type { CardViewModel, PrRowViewModel } from './types.ts'

const MAX_PRS_ON_CARD = 6

export function toCardViewModel(data: CardData): CardViewModel {
  const { fullName, cache, prs, trend } = data
  const [owner = '', name = ''] = fullName.split('/')

  const displayPrs = prs.slice(0, MAX_PRS_ON_CARD)
  const prMore = Math.max(0, prs.length - displayPrs.length)
  const ciStatuses = prs.map((p) => p.ciStatus) as CiStatus[]
  const overallCi = aggregateCiStatus(ciStatuses)

  const prRows: PrRowViewModel[] = displayPrs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    draft: pr.draft,
    ciColor: ciColor(pr.ciStatus),
    ciLabel: ciLabel(pr.ciStatus),
    prUrl: pr.prUrl,
  }))

  const dep = cache.dependabotCount
  const trendStr = formatTrend(trend)

  return {
    fullName,
    owner,
    name,
    repoUrl: `https://github.com/${fullName}`,
    securityUrl: `https://github.com/${fullName}/security/dependabot`,
    lastCommit: formatRelative(cache.lastCommitAt),
    ciDotColor: overallCi ? ciColor(overallCi) : 'transparent',
    ciDotLabel: overallCi ? ciLabel(overallCi) : '',
    showCiDot: overallCi !== null,
    depDisplay: dep !== null ? String(dep) : '—',
    depColor: depColor(dep),
    depLabel: dep === null
      ? 'Dependabot: kein Zugriff'
      : dep === 0
        ? 'Keine Dependabot-Alerts'
        : `${dep} Alert${dep === 1 ? '' : 's'}`,
    depTrend: trendStr,
    hasDepTrend: trendStr.length > 0,
    depCollecting: dep !== null && trendStr.length === 0,
    prs: prRows,
    hasPrs: prRows.length > 0,
    noPrs: prRows.length === 0,
    prTotal: cache.prTotal,
    prMore,
    hasMore: prMore > 0,
    prMoreLabel: prMore === 1 ? '+ 1 weiterer PR' : `+ ${prMore} weitere PRs`,
  }
}

export function renderCard(vm: CardViewModel): string {
  return `
<div class="card" draggable="true" data-card-name="${vm.fullName}"
     style="border-color: ${vm.ciDotColor === 'transparent' ? '#30363d' : '#30363d'}">
  <div class="card-header">
    <div style="flex:1;min-width:0;overflow:hidden">
      <a href="${vm.repoUrl}" target="_blank" rel="noopener noreferrer"
         style="text-decoration:none;color:inherit">
        <span style="font-size:11px;color:#6e7681">${vm.owner}/</span><span
          style="font-size:13px;font-weight:600">${vm.name}</span>
      </a>
    </div>
    ${vm.showCiDot ? `<div class="ci-dot" style="background:${vm.ciDotColor}" title="${vm.ciDotLabel}"></div>` : ''}
    <button hx-get="/api/card/${vm.owner}/${vm.name}"
            hx-target="closest .card" hx-swap="outerHTML"
            style="background:transparent;border:none;padding:3px;color:#6e7681;cursor:pointer"
            title="Neu laden">↻</button>
    <button hx-post="/api/cards/${vm.owner}/${vm.name}"
            hx-swap="none" hx-on::after-request="htmx.trigger(document.body,'cardsChanged')"
            style="background:transparent;border:none;padding:3px 5px;color:#6e7681;cursor:pointer"
            title="Entfernen">×</button>
  </div>
  <div class="card-body">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;font-size:11px">
      <span style="color:#8b949e">⏱ ${vm.lastCommit}</span>
      ${vm.depDisplay !== '—' ? `
      <a href="${vm.securityUrl}" target="_blank" rel="noopener noreferrer"
         style="color:${vm.depColor};display:flex;align-items:center;gap:4px;text-decoration:none"
         title="${vm.depLabel}">
        🛡 ${vm.depDisplay}
        ${vm.hasDepTrend ? `<span style="font-size:10px;color:#6e7681">${vm.depTrend}</span>` : ''}
        ${vm.depCollecting ? `<span style="font-size:10px;color:#484f58" title="Verlauf wird aufgebaut">···</span>` : ''}
      </a>` : ''}
    </div>
    <div style="border-top:1px solid #21262d;padding-top:9px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:10px;font-weight:600;color:#6e7681;text-transform:uppercase">Pull Requests</span>
        <span class="badge">${vm.prTotal}</span>
      </div>
      ${vm.hasPrs ? `
      <div style="display:flex;flex-direction:column;gap:1px">
        ${vm.prs.map((pr) => `
        <a href="${pr.prUrl}" target="_blank" rel="noopener noreferrer" class="pr-row">
          <div class="ci-dot" style="background:${pr.ciColor}" title="${pr.ciLabel}"></div>
          <span style="font-size:10px;color:#6e7681;font-family:monospace">#${pr.number}</span>
          <span style="font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${pr.title}</span>
          ${pr.draft ? '<span class="badge">Draft</span>' : ''}
        </a>`).join('')}
      </div>
      ${vm.hasMore ? `
      <button hx-get="/api/prs/${vm.owner}/${vm.name}"
              hx-target="#modal" hx-swap="innerHTML"
              style="width:100%;font-size:11px;color:#2f81f7;padding:5px;text-align:center;
                     background:transparent;border:none;cursor:pointer;font-family:inherit">
        ${vm.prMoreLabel}
      </button>` : ''}
      ` : `
      <div style="font-size:12px;color:#8b949e;padding:5px">✓ Keine offenen PRs</div>`}
    </div>
  </div>
</div>`
}

export function renderCards(vms: CardViewModel[]): string {
  if (vms.length === 0) {
    return `<div style="display:flex;flex-direction:column;align-items:center;padding:60px 20px;text-align:center;color:#8b949e">
      <h2 style="color:#e6edf3;margin:0 0 8px">Noch keine Repos gepinnt</h2>
      <p style="margin:0 0 24px">Klicke auf "Repo hinzufügen" um loszulegen.</p>
    </div>`
  }
  return `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">
    ${vms.map(renderCard).join('')}
  </div>`
}
```

- [ ] **Step 6: Card Template testen**

```typescript
// tests/unit/templates/card-template.test.ts
import { describe, expect, test } from 'bun:test'
import { renderCard, renderCards, toCardViewModel } from '../../../src/templates/card-template.ts'
import type { CardData } from '../../../src/services/card-service.ts'

const emptyCardData = (fullName: string): CardData => ({
  fullName,
  cache: {
    fullName,
    lastCommitAt: new Date('2026-06-20T10:00:00Z'),
    prTotal: 0,
    dependabotCount: 0,
    cachedAt: new Date(),
  },
  prs: [],
  trend: { week: null, month: null, sixMonths: null },
})

describe('toCardViewModel', () => {
  test('splits fullName into owner and name', () => {
    const vm = toCardViewModel(emptyCardData('alice/my-repo'))
    expect(vm.owner).toBe('alice')
    expect(vm.name).toBe('my-repo')
  })

  test('noPrs is true when prs array is empty', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'))
    expect(vm.noPrs).toBe(true)
    expect(vm.hasPrs).toBe(false)
  })

  test('depDisplay shows count when dependabotCount is 0', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'))
    expect(vm.depDisplay).toBe('0')
  })
})

describe('renderCard', () => {
  test('contains repo link', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'))
    const html = renderCard(vm)
    expect(html).toContain('https://github.com/alice/alpha')
  })

  test('contains HTMX refresh button', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'))
    const html = renderCard(vm)
    expect(html).toContain('hx-get="/api/card/alice/alpha"')
  })
})

describe('renderCards', () => {
  test('shows empty state when no cards', () => {
    expect(renderCards([])).toContain('Noch keine Repos gepinnt')
  })

  test('renders card html for each viewmodel', () => {
    const vms = [
      toCardViewModel(emptyCardData('alice/alpha')),
      toCardViewModel(emptyCardData('alice/beta')),
    ]
    const html = renderCards(vms)
    expect(html).toContain('alice/alpha')
    expect(html).toContain('alice/beta')
  })
})
```

```bash
bun test tests/unit/templates/
```

Erwartete Ausgabe: 14 passing tests (10 formatter + 4+ card-template).

- [ ] **Step 7: Page Template schreiben**

```typescript
// src/templates/page-template.ts
import type { AuthToken } from '../db/types.ts'
import { DASHBOARD_CSS } from './styles.ts'

const CLIENT_SCRIPT = `
let _dragIdx = -1;
document.addEventListener('dragstart', e => {
  const c = e.target.closest('[data-card-name]');
  if (!c) return;
  _dragIdx = [...document.querySelectorAll('[data-card-name]')].indexOf(c);
  c.style.opacity = '0.4';
});
document.addEventListener('dragend', e => {
  const c = e.target.closest('[data-card-name]');
  if (c) c.style.opacity = '';
  _dragIdx = -1;
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  const target = e.target.closest('[data-card-name]');
  if (!target || _dragIdx < 0) return;
  const cards = [...document.querySelectorAll('[data-card-name]')];
  const names = cards.map(c => c.dataset.cardName);
  const overIdx = cards.indexOf(target);
  if (_dragIdx === overIdx) return;
  const [moved] = names.splice(_dragIdx, 1);
  names.splice(overIdx, 0, moved);
  fetch('/api/cards/reorder', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({order: names})
  }).then(() => htmx.trigger(document.body, 'cardsChanged'));
});
document.getElementById('repo-search')?.addEventListener('input', function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll('[data-repo-name]').forEach(el => {
    el.style.display = el.dataset.repoName.toLowerCase().includes(q) ? '' : 'none';
  });
});
`

export function renderSetupPage(error?: string): string {
  return `<!DOCTYPE html><html lang="de"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GitHub Dashboard — Setup</title>
  <style>${DASHBOARD_CSS}</style>
</head><body>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
    <div style="width:100%;max-width:440px">
      <h1 style="text-align:center;font-size:24px;font-weight:600;margin-bottom:32px">GitHub Dashboard</h1>
      <form method="POST" action="/api/auth"
            style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:28px">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">
          Personal Access Token (classic)
        </label>
        <input name="pat" type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
               required autofocus
               style="width:100%;background:#0d1117;border:1px solid #30363d;border-radius:6px;
                      padding:9px 12px;color:#e6edf3;font-size:13px;font-family:monospace;
                      outline:none;margin-bottom:12px"/>
        ${error ? `<div style="color:#f85149;font-size:13px;margin-bottom:12px">${error}</div>` : ''}
        <div style="font-size:12px;color:#8b949e;margin-bottom:16px">
          Benötigte Scopes: <code>repo</code> · <code>security_events</code>
        </div>
        <button type="submit" class="btn-primary" style="width:100%;padding:10px">
          Mit GitHub verbinden
        </button>
      </form>
    </div>
  </div>
</body></html>`
}

export function renderDashboard(cardsHtml: string, username: string): string {
  return `<!DOCTYPE html><html lang="de"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GitHub Dashboard</title>
  <style>${DASHBOARD_CSS}</style>
  <script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js" crossorigin="anonymous"></script>
</head><body>
  <header style="background:#161b22;border-bottom:1px solid #30363d;height:56px;
                 display:flex;align-items:center;padding:0 20px;gap:10px;
                 position:sticky;top:0;z-index:100">
    <span style="font-size:15px;font-weight:600">Dashboard</span>
    <div style="flex:1"></div>
    <button class="btn-ghost"
            hx-get="/api/cards" hx-target="#cards" hx-swap="innerHTML"
            hx-on::after-request="htmx.trigger(document.body,'cardsChanged')">
      Aktualisieren
    </button>
    <button class="btn-primary"
            hx-get="/api/modal/repos" hx-target="#modal" hx-swap="innerHTML">
      + Repo hinzufügen
    </button>
    <span style="font-size:13px;color:#8b949e">${username}</span>
    <form method="POST" action="/api/auth" style="margin:0">
      <input type="hidden" name="_method" value="DELETE">
      <button type="submit"
              style="background:transparent;border:none;color:#6e7681;cursor:pointer;font-size:12px">
        Abmelden
      </button>
    </form>
  </header>
  <main style="padding:20px 24px">
    <div id="cards"
         hx-get="/api/cards"
         hx-trigger="every 10s, cardsChanged from:body"
         hx-swap="innerHTML">
      ${cardsHtml}
    </div>
  </main>
  <div id="modal"></div>
  <script>${CLIENT_SCRIPT}</script>
</body></html>`
}
```

- [ ] **Step 8: Commit**

```bash
git add src/templates/ tests/unit/templates/
git commit -m "feat(templates): add formatters, card template, and page template"
```

---

### Task 12: Modal + PR-Modal Templates

**Files:**
- Create: `src/templates/modal-template.ts`
- Create: `src/templates/pr-modal-template.ts`

**Interfaces:**
- Consumes: `GitHubRepo` (Task 9), `PullRequest` (Phase 2), `RepoListItemViewModel` aus `types.ts`
- Produces: `renderRepoModal()`, `renderPrModal()`

- [ ] **Step 1: Modal Template schreiben**

```typescript
// src/templates/modal-template.ts
import type { GitHubRepo } from '../github/github-client.ts'
import { formatRelative } from './formatters.ts'
import type { RepoListItemViewModel } from './types.ts'

export function toRepoListItem(repo: GitHubRepo, isPinned: boolean): RepoListItemViewModel {
  return {
    fullName: repo.fullName,
    name: repo.name,
    owner: repo.owner,
    isPinned,
    isPrivate: repo.isPrivate,
    language: repo.language,
    starsDisplay: repo.stargazersCount > 0 ? String(repo.stargazersCount) : null,
    updatedAt: formatRelative(new Date(repo.updatedAt)),
  }
}

function renderRepoRow(vm: RepoListItemViewModel): string {
  return `
<div data-repo-name="${vm.fullName}"
     style="display:flex;align-items:center;gap:12px;padding:10px 16px;
            border-bottom:1px solid #21262d;cursor:pointer"
     hx-post="/api/cards/${vm.owner}/${vm.name}"
     hx-swap="none"
     hx-on::after-request="htmx.trigger(document.body,'cardsChanged')"
     onclick="this.querySelector('.check').style.background = this.querySelector('.check').style.background === 'rgb(35,134,54)' ? 'transparent' : '#238636'">
  <div class="check" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;
       border:1.5px solid ${vm.isPinned ? '#238636' : '#30363d'};
       background:${vm.isPinned ? '#238636' : 'transparent'};
       display:flex;align-items:center;justify-content:center">
    ${vm.isPinned ? '<svg width="9" height="9" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>' : ''}
  </div>
  <div style="flex:1;min-width:0">
    <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      <span style="color:#6e7681">${vm.owner}/</span><span style="font-weight:500">${vm.name}</span>
      ${vm.isPrivate ? '<span class="badge" style="margin-left:6px">Privat</span>' : ''}
    </div>
    <div style="font-size:11px;color:#6e7681;margin-top:2px">
      ${vm.updatedAt}${vm.language ? ` · ${vm.language}` : ''}
    </div>
  </div>
  ${vm.starsDisplay ? `<span style="font-size:11px;color:#8b949e">★ ${vm.starsDisplay}</span>` : ''}
</div>`
}

export function renderRepoModal(repos: GitHubRepo[], pinned: Set<string>): string {
  const items = repos.slice(0, 100).map((r) => toRepoListItem(r, pinned.has(r.fullName)))
  return `
<div class="modal-overlay" onclick="if(event.target===this)document.getElementById('modal').innerHTML=''">
  <div class="modal" onclick="event.stopPropagation()">
    <div style="padding:15px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:15px;font-weight:600;flex:1">Repos verwalten</span>
      <button onclick="document.getElementById('modal').innerHTML=''"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    <div style="padding:10px 14px;border-bottom:1px solid #21262d">
      <input id="repo-search" type="text" placeholder="Repo suchen…"
             style="width:100%;background:#0d1117;border:1px solid #30363d;border-radius:6px;
                    padding:7px 11px;color:#e6edf3;font-size:13px;outline:none"/>
    </div>
    <div style="overflow-y:auto;flex:1">
      ${items.map(renderRepoRow).join('')}
    </div>
  </div>
</div>`
}
```

- [ ] **Step 2: PR-Modal Template schreiben**

```typescript
// src/templates/pr-modal-template.ts
import type { PullRequest } from '../db/types.ts'
import { ciColor, ciLabel, formatRelative } from './formatters.ts'

function labelStyle(hexColor: string): string {
  const r = parseInt(hexColor.slice(0, 2), 16) || 139
  const g = parseInt(hexColor.slice(2, 4), 16) || 148
  const b = parseInt(hexColor.slice(4, 6), 16) || 158
  return `background:rgba(${r},${g},${b},.15);color:#${hexColor};border:1px solid rgba(${r},${g},${b},.5)`
}

export function renderPrModal(fullName: string, prs: PullRequest[]): string {
  const now = new Date()
  return `
<div class="modal-overlay" style="max-width:980px;padding:48px 20px 20px"
     onclick="if(event.target===this)document.getElementById('modal').innerHTML=''">
  <div class="modal" style="max-width:980px" onclick="event.stopPropagation()">
    <div style="padding:14px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:14px;font-weight:600;flex:1">
        Pull Requests &nbsp;<span style="color:#6e7681;font-weight:400">${fullName}</span>
      </span>
      <button onclick="document.getElementById('modal').innerHTML=''"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    <div style="display:grid;grid-template-columns:76px 1fr 130px 106px 118px;
                padding:7px 16px;border-bottom:1px solid #21262d;
                font-size:10px;font-weight:600;color:#6e7681;text-transform:uppercase">
      <span>#</span><span>Titel</span>
      <span>Ersteller</span><span>Erstellt</span><span>Aktualisiert</span>
    </div>
    <div style="overflow-y:auto;flex:1">
      ${prs.map((pr) => `
      <a href="${pr.prUrl}" target="_blank" rel="noopener noreferrer"
         style="display:grid;grid-template-columns:76px 1fr 130px 106px 118px;
                padding:8px 16px;border-bottom:1px solid #21262d;
                text-decoration:none;color:inherit;align-items:center"
         onmouseover="this.style.background='#1c2128'" onmouseout="this.style.background=''">
        <div style="display:flex;align-items:center;gap:5px">
          <div class="ci-dot" style="background:${ciColor(pr.ciStatus)}" title="${ciLabel(pr.ciStatus)}"></div>
          <span style="font-size:11px;color:#6e7681;font-family:monospace">#${pr.number}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;min-width:0;padding-right:12px">
          <span style="font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${pr.title}
          </span>
          ${pr.draft ? '<span class="badge">Draft</span>' : ''}
          ${pr.labels.map((l) => `<span style="font-size:10px;border-radius:20px;padding:1px 7px;${labelStyle(l.color)}">${l.name}</span>`).join('')}
        </div>
        <span style="font-size:11px;color:#8b949e">${pr.creator}</span>
        <span style="font-size:11px;color:#8b949e">${formatRelative(pr.createdAt, now)}</span>
        <span style="font-size:11px;color:#8b949e">${formatRelative(pr.updatedAt, now)}</span>
      </a>`).join('')}
    </div>
  </div>
</div>`
}
```

- [ ] **Step 3: Commit**

```bash
git add src/templates/modal-template.ts src/templates/pr-modal-template.ts
git commit -m "feat(templates): add repo modal and PR modal templates"
```

---

### Task 13: Routes, Server + Composition Root

**Files:**
- Create: `src/routes/route-handler.ts`
- Create: `src/routes/auth-route.ts`
- Create: `src/routes/card-route.ts`
- Create: `src/routes/modal-route.ts`
- Create: `src/routes/pr-route.ts`
- Create: `src/server.ts`
- Modify: `src/index.ts`
- Create: `tests/unit/routes/auth-route.test.ts`
- Create: `tests/unit/routes/card-route.test.ts`

**Interfaces:**
- Consumes: alle Services + Templates
- Produces: laufender Dashboard-Server auf Port 4242

- [ ] **Step 1: RouteHandler Interface**

```typescript
// src/routes/route-handler.ts
export interface RouteHandler {
  match(url: URL, method: string): boolean
  handle(req: Request, url: URL): Promise<Response> | Response
}

export function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } })
}

export function htmxTrigger(body: string, event: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'HX-Trigger': event,
    },
  })
}
```

- [ ] **Step 2: Auth Routes**

```typescript
// src/routes/auth-route.ts
import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { GitHubClient } from '../github/github-client.ts'
import { html, redirect } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'
import { renderSetupPage } from '../templates/page-template.ts'

export function createAuthRoutes(authRepo: AuthRepo, client: GitHubClient): RouteHandler[] {
  return [
    // GET / — Setup-Seite wenn nicht eingeloggt
    {
      match: (url, method) => url.pathname === '/' && method === 'GET' && !authRepo.getToken(),
      handle: () => html(renderSetupPage()),
    },
    // POST /api/auth — PAT speichern
    {
      match: (url, method) => url.pathname === '/api/auth' && method === 'POST',
      async handle(req) {
        const form = await req.formData()
        const methodOverride = form.get('_method')

        // DELETE via POST (_method override für HTML-Forms)
        if (methodOverride === 'DELETE') {
          authRepo.deleteToken()
          return redirect('/')
        }

        const pat = String(form.get('pat') ?? '').trim()
        if (!pat) return html(renderSetupPage('Bitte Token eingeben'), 400)

        try {
          // PAT temporär setzen um getUser() zu testen
          authRepo.saveToken({ pat, username: '', avatarUrl: '' })
          const user = await client.getUser()
          authRepo.saveToken({ pat, username: user.login, avatarUrl: user.avatarUrl })
          return redirect('/')
        } catch (e) {
          authRepo.deleteToken()
          const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
          return html(renderSetupPage(msg), 401)
        }
      },
    },
  ]
}
```

- [ ] **Step 3: Card Routes**

```typescript
// src/routes/card-route.ts
import type { CardService } from '../services/card-service.ts'
import type { AuthRepo } from '../db/auth/auth-repo.ts'
import { html, htmxTrigger, redirect } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'
import { renderCards, renderCard, toCardViewModel } from '../templates/card-template.ts'
import { renderDashboard } from '../templates/page-template.ts'

export function createCardRoutes(cardService: CardService, authRepo: AuthRepo): RouteHandler[] {
  return [
    // GET / — vollständiges Dashboard
    {
      match: (url, method) => url.pathname === '/' && method === 'GET',
      async handle() {
        const token = authRepo.getToken()
        if (!token) return redirect('/')
        const cards = await cardService.getCards()
        const vms = cards.map(toCardViewModel)
        return html(renderDashboard(renderCards(vms), token.username))
      },
    },
    // GET /api/cards — HTMX Partial für alle Cards
    {
      match: (url, method) => url.pathname === '/api/cards' && method === 'GET',
      async handle() {
        const cards = await cardService.getCards()
        return html(renderCards(cards.map(toCardViewModel)))
      },
    },
    // GET /api/card/:owner/:repo — einzelne Card
    {
      match: (url, method) =>
        method === 'GET' && /^\/api\/card\/[^/]+\/[^/]+$/.test(url.pathname),
      async handle(_req, url) {
        const [, , , owner, repo] = url.pathname.split('/')
        const fullName = `${owner}/${repo}`
        const data = await cardService.getCard(fullName)
        return html(renderCard(toCardViewModel(data)))
      },
    },
    // POST /api/cards/:owner/:repo — Pin/Unpin toggle
    {
      match: (url, method) =>
        method === 'POST' && /^\/api\/cards\/[^/]+\/[^/]+$/.test(url.pathname),
      handle(_req, url) {
        const [, , , owner, repo] = url.pathname.split('/')
        cardService.togglePin(`${owner}/${repo}`)
        return htmxTrigger('', 'cardsChanged')
      },
    },
    // POST /api/cards/reorder
    {
      match: (url, method) => url.pathname === '/api/cards/reorder' && method === 'POST',
      async handle(req) {
        const body = (await req.json()) as { order: string[] }
        cardService.reorder(body.order)
        return htmxTrigger('', 'cardsChanged')
      },
    },
  ]
}
```

- [ ] **Step 4: Modal + PR Routes**

```typescript
// src/routes/modal-route.ts
import type { CardService } from '../services/card-service.ts'
import type { CardRepo } from '../db/cards/card-repo.ts'
import { html } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'
import { renderRepoModal } from '../templates/modal-template.ts'

export function createModalRoutes(cardService: CardService, cardRepo: CardRepo): RouteHandler[] {
  return [
    {
      match: (url, method) => url.pathname === '/api/modal/repos' && method === 'GET',
      async handle() {
        const repos = await cardService.getAllRepos()
        const pinned = new Set(cardRepo.getPinned().map((r) => r.fullName))
        return html(renderRepoModal(repos, pinned))
      },
    },
  ]
}
```

```typescript
// src/routes/pr-route.ts
import type { PrRepo } from '../db/pull-requests/pr-repo.ts'
import { html } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'
import { renderPrModal } from '../templates/pr-modal-template.ts'

export function createPrRoutes(prRepo: PrRepo): RouteHandler[] {
  return [
    {
      match: (url, method) =>
        method === 'GET' && /^\/api\/prs\/[^/]+\/[^/]+$/.test(url.pathname),
      handle(_req, url) {
        const [, , , owner, repo] = url.pathname.split('/')
        const fullName = `${owner}/${repo}`
        const prs = prRepo.getPrs(fullName)
        return html(renderPrModal(fullName, prs))
      },
    },
  ]
}
```

- [ ] **Step 5: Auth Route testen**

```typescript
// tests/unit/routes/auth-route.test.ts
import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { GitHubClient } from '../../../src/github/github-client.ts'
import { createAuthRoutes } from '../../../src/routes/auth-route.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: 'https://x.com/a.png' })),
    getRepos: mock(async () => []),
    getPrs: mock(async () => []),
    getLastCommitDate: mock(async () => null),
    getCiStatus: mock(async () => 'unknown' as const),
    getDependabotCount: mock(async () => null),
    ...overrides,
  }
}

describe('auth routes', () => {
  test('GET / shows setup page when no token', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    const routes = createAuthRoutes(repos.auth, makeClient())

    const url = new URL('http://localhost:4242/')
    const route = routes.find((r) => r.match(url, 'GET'))
    const res = await route!.handle(new Request(url), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('Personal Access Token')

    repos.close()
    cleanupTempDir(dir)
  })

  test('POST /api/auth saves token and redirects on success', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    const routes = createAuthRoutes(repos.auth, makeClient())

    const url = new URL('http://localhost:4242/api/auth')
    const form = new FormData()
    form.append('pat', 'ghp_testtoken')
    const req = new Request(url, { method: 'POST', body: form })
    const route = routes.find((r) => r.match(url, 'POST'))
    const res = await route!.handle(req, url)

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/')
    expect(repos.auth.getToken()?.username).toBe('alice')

    repos.close()
    cleanupTempDir(dir)
  })

  test('POST /api/auth with _method=DELETE clears token', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '' })
    const routes = createAuthRoutes(repos.auth, makeClient())

    const url = new URL('http://localhost:4242/api/auth')
    const form = new FormData()
    form.append('_method', 'DELETE')
    const req = new Request(url, { method: 'POST', body: form })
    const route = routes.find((r) => r.match(url, 'POST'))
    await route!.handle(req, url)

    expect(repos.auth.getToken()).toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })
})
```

- [ ] **Step 6: Card Route testen**

```typescript
// tests/unit/routes/card-route.test.ts
import { describe, expect, mock, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { GitHubClient } from '../../../src/github/github-client.ts'
import { createCardService } from '../../../src/services/card-service.ts'
import { createCardRoutes } from '../../../src/routes/card-route.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

function makeClient(): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: '' })),
    getRepos: mock(async () => []),
    getPrs: mock(async () => []),
    getLastCommitDate: mock(async () => null),
    getCiStatus: mock(async () => 'unknown' as const),
    getDependabotCount: mock(async () => null),
  }
}

describe('card routes', () => {
  test('POST /api/cards/owner/repo toggles pin and returns HX-Trigger', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    const service = createCardService(repos, makeClient())
    const routes = createCardRoutes(service, repos.auth)

    const url = new URL('http://localhost:4242/api/cards/alice/alpha')
    const route = routes.find((r) => r.match(url, 'POST'))
    const res = await route!.handle(new Request(url, { method: 'POST' }), url)

    expect(res.headers.get('HX-Trigger')).toBe('cardsChanged')
    expect(repos.cards.isPinned('alice/alpha')).toBe(true)

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/cards returns cards HTML', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '' })
    const service = createCardService(repos, makeClient())
    const routes = createCardRoutes(service, repos.auth)

    const url = new URL('http://localhost:4242/api/cards')
    const route = routes.find((r) => r.match(url, 'GET'))
    const res = await route!.handle(new Request(url), url)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')

    repos.close()
    cleanupTempDir(dir)
  })
})
```

- [ ] **Step 7: Server + Composition Root schreiben**

```typescript
// src/server.ts
import type { RouteHandler } from './routes/route-handler.ts'

export function startServer(port: number, routes: RouteHandler[]): void {
  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)
      for (const route of routes) {
        if (route.match(url, req.method)) {
          return route.handle(req, url)
        }
      }
      return new Response('Not found', { status: 404 })
    },
  })
  console.log(`GitHub Dashboard running at http://localhost:${port}`)
}
```

```typescript
// src/index.ts
import { createSqliteRepos } from './db/sqlite-repository.ts'
import { createGitHubClient } from './github/github-client.ts'
import { createCardService } from './services/card-service.ts'
import { createAuthRoutes } from './routes/auth-route.ts'
import { createCardRoutes } from './routes/card-route.ts'
import { createModalRoutes } from './routes/modal-route.ts'
import { createPrRoutes } from './routes/pr-route.ts'
import { startServer } from './server.ts'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DB_PATH = process.env['GH_DASH_DB'] ?? join(homedir(), '.github-dashboard.db')
const PORT = Number(process.env['PORT'] ?? 4242)

const repos = createSqliteRepos(DB_PATH)
const client = createGitHubClient(repos.auth)
const cardService = createCardService(repos, client)

const routes = [
  ...createAuthRoutes(repos.auth, client),
  ...createCardRoutes(cardService, repos.auth),
  ...createModalRoutes(cardService, repos.cards),
  ...createPrRoutes(repos.pullRequests),
]

startServer(PORT, routes)
```

- [ ] **Step 8: Alle Unit-Tests laufen lassen**

```bash
bun test tests/unit/
```

Erwartete Ausgabe: Alle tests passing.

- [ ] **Step 9: Server manuell testen**

```bash
bun run dev
```

Browser öffnen: `http://localhost:4242` — Setup-Seite sollte erscheinen. PAT eingeben, verbinden, Dashboard erscheint.

- [ ] **Step 10: Commit**

```bash
git add src/routes/ src/server.ts src/index.ts tests/unit/routes/
git commit -m "feat: add routes, server and composition root — dashboard is functional"
```

---

## Phase 3 abgeschlossen ✓

Ergebnis:
- GitHub Client mit injizierbarem fetch für Tests
- Card Service mit 30s SQLite-Cache + Dependabot-Trend
- Alle HTML-Templates als TypeScript-Funktionen
- 10 HTTP-Routes: Auth, Cards, Modal, PRs
- Funktionierendes lokales Dashboard auf Port 4242

```bash
bun run dev   # → http://localhost:4242
bun test tests/unit/  # → alle tests passing
```

**Nächste Phase:** `2026-06-20-phase-4-e2e-readme.md` — Playwright E2E Tests + README
