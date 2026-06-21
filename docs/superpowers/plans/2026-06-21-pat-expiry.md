# PAT Expiry Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a severity-coloured icon next to the user avatar when a PAT has an expiry date, with a hover tooltip and a click-through modal for inline token renewal.

**Architecture:** Capture `GitHub-Authentication-Token-Expiration` response header in `getUser()`, persist it under the `pat_expires_at` settings key, backfill it once on first dashboard load for existing users (Approach B), then surface it via a warning icon + renewal modal rendered in the page header.

**Tech Stack:** Bun, TypeScript (strict), SQLite via `bun:sqlite`, HTMX (CDN), server-side HTML templates, Playwright e2e.

## Global Constraints

- All identifiers, comments, and UI strings are in English (not German) for new code; leave existing German strings unchanged.
- No mocking of SQLite — unit tests use real in-process DBs via `createTempDbPath`.
- Run `bun run check:fix` before every commit to satisfy Biome; no `--no-verify`.
- Commit message subjects must be lowercase (`feat(auth): …`, not `Feat(auth): …`).
- TDD: write the failing test first, then the implementation.
- No non-null assertions (`!`); use optional chaining (`?.`) or explicit guards.
- Severity bands: `warning` ≤ 3 days · `notice` 4–21 days · `info` > 21 days.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/db/types.ts` | Modify | Add `expiresAt: Date \| null` to `AuthToken` |
| `src/db/auth/sqlite-auth-repo.ts` | Modify | Read/write/delete `pat_expires_at` KV key |
| `tests/unit/db/auth-repo.test.ts` | Modify | Add expiresAt round-trip tests |
| `src/github/github-client.ts` | Modify | `getUser()` reads expiry header; `GitHubUser` gains `expiresAt` |
| `tests/unit/github/github-client.test.ts` | Modify | Add header-parsing tests; add `expiresAt: null` to all `saveToken` calls |
| `src/services/pat-expiry-service.ts` | **Create** | Pure `getPatExpirySeverity(expiresAt, now)` + `PatExpirySeverity` type |
| `tests/unit/services/pat-expiry-service.test.ts` | **Create** | Threshold tests for all severity bands |
| `src/routes/auth-route.ts` | Modify | Pass `expiresAt` from `getUser()` to `saveToken`; return `HX-Redirect` for HTMX requests |
| `tests/unit/routes/auth-route.test.ts` | Modify | Tests for expiresAt persistence + HTMX redirect |
| `src/routes/card-route.ts` | Modify | Inject `GitHubClient`; backfill `expiresAt`; compute severity; pass to `renderDashboard` |
| `tests/unit/routes/card-route.test.ts` | Modify | Tests for backfill logic |
| `src/templates/page-template.ts` | Modify | `renderDashboard` gains `expiresAt`/`severity` params; renders icon + modal |
| `tests/unit/templates/page-template.test.ts` | Modify | Tests for icon, tooltip, modal, no-icon-when-null |
| `src/index.ts` | Modify | Pass `client` to `createCardRoutes`; add `expiresAt: null` to test route `saveToken` |
| `tests/e2e/seed-db.ts` | Modify | Accept `patExpiresAt` option |
| `tests/e2e/dashboard.spec.ts` | Modify | E2E: icon severities, modal open/close, renewal form |

---

### Task 1: Extend AuthToken type and sqlite-auth-repo

**Files:**
- Modify: `src/db/types.ts`
- Modify: `src/db/auth/sqlite-auth-repo.ts`
- Modify: `tests/unit/db/auth-repo.test.ts`

**Interfaces:**
- Produces: `AuthToken.expiresAt: Date | null` — all later tasks read this field

- [ ] **Step 1: Write failing tests for expiresAt persistence**

Add to `tests/unit/db/auth-repo.test.ts`, inside `describe('AuthRepo', ...)`:

```typescript
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
  const { Database } = require('bun:sqlite') as typeof import('bun:sqlite')
  const { runMigrations } = require('../../../src/db/migrations.ts') as typeof import('../../../src/db/migrations.ts')
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
    pat: 'ghp_test', username: 'alice', avatarUrl: '',
    expiresAt: new Date('2026-12-31T00:00:00.000Z'),
  })
  repos.auth.deleteToken()
  // Re-save PAT manually to check pat_expires_at was deleted
  const db = (repos as unknown as { db: import('bun:sqlite').Database }).db
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('pat', 'ghp_new')")
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('username', 'bob')")
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('avatar_url', '')")
  const token = repos.auth.getToken()

  expect(token?.expiresAt).toBeNull()

  repos.close()
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
bun test tests/unit/db/auth-repo.test.ts
```

Expected: `saveToken persists expiresAt` FAIL — "Expected property expiresAt to exist"

- [ ] **Step 3: Update AuthToken type**

Replace the `AuthToken` type in `src/db/types.ts`:

```typescript
export type AuthToken = {
  readonly pat: string
  readonly username: string
  readonly avatarUrl: string
  readonly expiresAt: Date | null
}
```

- [ ] **Step 4: Update sqlite-auth-repo**

Replace the entire body of `src/db/auth/sqlite-auth-repo.ts`:

```typescript
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
      const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null
      return { pat, username, avatarUrl, expiresAt }
    },

    saveToken(token) {
      db.transaction(() => {
        upsert.run('pat', token.pat)
        upsert.run('username', token.username)
        upsert.run('avatar_url', token.avatarUrl)
        if (token.expiresAt !== null) {
          upsert.run('pat_expires_at', token.expiresAt.toISOString())
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
```

- [ ] **Step 5: Fix TypeScript errors from the type change**

Run `bun x tsc --noEmit` to find all callers of `saveToken` that are missing `expiresAt`. Add `expiresAt: null` to every call in:

- `tests/unit/db/auth-repo.test.ts` — 4 existing calls (lines ~26, ~45, ~50, ~66)
- `tests/unit/routes/card-route.test.ts` — 2 calls (lines ~42, ~61)
- `tests/unit/routes/auth-route.test.ts` — 1 call (line ~62)
- `tests/e2e/seed-db.ts` — 1 call (line 12)
- `src/index.ts` — 1 call inside the test route (line ~33)

Pattern: every `{ pat: '…', username: '…', avatarUrl: '…' }` → `{ pat: '…', username: '…', avatarUrl: '…', expiresAt: null }`.

Also update `makeClient` in `tests/unit/routes/auth-route.test.ts` and `tests/unit/services/card-service.test.ts`:
```typescript
getUser: mock(async () => ({ login: 'alice', avatarUrl: 'https://x.com/a.png', expiresAt: null })),
```
(The `expiresAt: null` here matches `GitHubUser.expiresAt`, which you will add in Task 2. TypeScript will catch this after Task 2.)

Note: `src/routes/auth-route.ts` lines that call `saveToken` will be updated in Task 4 — leave them for now and expect TS errors there until then.

- [ ] **Step 6: Run tests — expect auth-repo tests to pass**

```bash
bun test tests/unit/db/auth-repo.test.ts
```

Expected: 8 tests pass (4 original + 4 new). Ignore TS errors in other files for now.

- [ ] **Step 7: Commit**

```bash
bun run check:fix
git add src/db/types.ts src/db/auth/sqlite-auth-repo.ts tests/unit/db/auth-repo.test.ts \
  tests/unit/routes/card-route.test.ts tests/unit/routes/auth-route.test.ts \
  tests/e2e/seed-db.ts src/index.ts tests/unit/services/card-service.test.ts
git commit -m "feat(auth): add expiresAt field to AuthToken and persist pat_expires_at"
```

---

### Task 2: Update GitHubClient.getUser() to capture the expiry header

**Files:**
- Modify: `src/github/github-client.ts`
- Modify: `tests/unit/github/github-client.test.ts`

**Interfaces:**
- Consumes: `AuthToken.expiresAt` from Task 1
- Produces: `GitHubUser.expiresAt: Date | null` — consumed by Tasks 4 and 5

- [ ] **Step 1: Write failing tests for header parsing**

Add to the `describe('GitHubClient', ...)` block in `tests/unit/github/github-client.test.ts`:

```typescript
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
```

Also update the existing `getUser maps login and avatar_url` test to add `expiresAt: null` to its `saveToken` call (from Step 5 of Task 1 — should already be done).

- [ ] **Step 2: Run tests — expect failures**

```bash
bun test tests/unit/github/github-client.test.ts --test-name-pattern "getUser returns expiresAt"
```

Expected: FAIL — `user.expiresAt` is undefined (property doesn't exist yet).

- [ ] **Step 3: Update GitHubUser type and getUser() implementation**

In `src/github/github-client.ts`, replace the `GitHubUser` type and `getUser()` method:

```typescript
// Replace the existing GitHubUser type:
export type GitHubUser = {
  readonly login: string
  readonly avatarUrl: string
  readonly expiresAt: Date | null
}
```

Replace the `getUser()` method inside `createGitHubClient`:

```typescript
async getUser() {
  const token = authRepo.getToken()
  if (!token) throw new Error('Not authenticated')
  const res = await fetchFn('https://api.github.com/user', {
    headers: {
      Authorization: `token ${token.pat}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })
  if (res.status === 401) throw new Error('Token ungültig (401)')
  if (res.status === 403) {
    const j = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(j.message ?? 'Zugriff verweigert (403)')
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(j.message ?? `API-Fehler ${res.status}`)
  }
  const d = (await res.json()) as { login: string; avatar_url: string }
  const expiryHeader = res.headers.get('GitHub-Authentication-Token-Expiration')
  const expiresAt = expiryHeader ? new Date(expiryHeader) : null
  return { login: d.login, avatarUrl: d.avatar_url, expiresAt }
},
```

- [ ] **Step 4: Update all saveToken calls in github-client.test.ts**

Every `repos.auth.saveToken({ pat: '…', username: '…', avatarUrl: '…' })` in `tests/unit/github/github-client.test.ts` needs `expiresAt: null` added. There are ~24 occurrences. Add `expiresAt: null` to each.

- [ ] **Step 5: Run tests — expect all to pass**

```bash
bun test tests/unit/github/github-client.test.ts
```

Expected: all tests pass including the 2 new ones.

- [ ] **Step 6: Commit**

```bash
bun run check:fix
git add src/github/github-client.ts tests/unit/github/github-client.test.ts
git commit -m "feat(github): getUser() captures GitHub-Authentication-Token-Expiration header"
```

---

### Task 3: Create pat-expiry-service

**Files:**
- Create: `src/services/pat-expiry-service.ts`
- Create: `tests/unit/services/pat-expiry-service.test.ts`

**Interfaces:**
- Produces: `getPatExpirySeverity(expiresAt: Date, now: Date): PatExpirySeverity` and `PatExpirySeverity` type — consumed by Tasks 5 and 6

- [ ] **Step 1: Write failing tests**

Create `tests/unit/services/pat-expiry-service.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { getPatExpirySeverity } from '../../../src/services/pat-expiry-service.ts'

const DAY = 86_400_000

describe('getPatExpirySeverity', () => {
  test('returns warning when token expires in 3 days', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 3 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('warning')
  })

  test('returns warning when token expires in 1 day', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 1 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('warning')
  })

  test('returns warning when token has already expired', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() - 1 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('warning')
  })

  test('returns notice when token expires in 4 days (boundary)', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 4 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('notice')
  })

  test('returns notice when token expires in 14 days', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 14 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('notice')
  })

  test('returns notice when token expires in 21 days (boundary)', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 21 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('notice')
  })

  test('returns info when token expires in 22 days', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 22 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('info')
  })

  test('returns info when token expires in 90 days', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 90 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('info')
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
bun test tests/unit/services/pat-expiry-service.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement pat-expiry-service**

Create `src/services/pat-expiry-service.ts`:

```typescript
export type PatExpirySeverity = 'info' | 'notice' | 'warning'

export function getPatExpirySeverity(expiresAt: Date, now: Date): PatExpirySeverity {
  const days = (expiresAt.getTime() - now.getTime()) / 86_400_000
  if (days <= 3) return 'warning'
  if (days <= 21) return 'notice'
  return 'info'
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
bun test tests/unit/services/pat-expiry-service.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
bun run check:fix
git add src/services/pat-expiry-service.ts tests/unit/services/pat-expiry-service.test.ts
git commit -m "feat(auth): add pat expiry severity service"
```

---

### Task 4: Update auth-route to persist expiresAt and support HX-Redirect

**Files:**
- Modify: `src/routes/auth-route.ts`
- Modify: `tests/unit/routes/auth-route.test.ts`

**Interfaces:**
- Consumes: `GitHubUser.expiresAt` (Task 2), `AuthToken.expiresAt` (Task 1)

- [ ] **Step 1: Write failing tests**

Add to `describe('auth routes', ...)` in `tests/unit/routes/auth-route.test.ts`:

```typescript
test('POST /api/auth saves expiresAt from getUser result', async () => {
  const { dir, dbPath } = createTempDbPath('gh-dash-route-')
  const repos = createSqliteRepos(dbPath)
  const expiresAt = new Date('2026-12-31T21:01:12.000Z')
  const routes = createAuthRoutes(
    repos.auth,
    makeClient({ getUser: mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt })) }),
  )

  const url = new URL('http://localhost:4242/api/auth')
  const form = new FormData()
  form.append('pat', 'ghp_testtoken')
  const req = new Request(url.href, { method: 'POST', body: form })
  const route = routes.find((r) => r.match(url, 'POST'))
  if (!route) throw new Error('route not found')
  await route.handle(req, url)

  expect(repos.auth.getToken()?.expiresAt?.toISOString()).toBe('2026-12-31T21:01:12.000Z')

  repos.close()
  cleanupTempDir(dir)
})

test('POST /api/auth with HX-Request header returns HX-Redirect instead of 302', async () => {
  const { dir, dbPath } = createTempDbPath('gh-dash-route-')
  const repos = createSqliteRepos(dbPath)
  const routes = createAuthRoutes(repos.auth, makeClient())

  const url = new URL('http://localhost:4242/api/auth')
  const form = new FormData()
  form.append('pat', 'ghp_testtoken')
  const req = new Request(url.href, {
    method: 'POST',
    body: form,
    headers: { 'HX-Request': 'true' },
  })
  const route = routes.find((r) => r.match(url, 'POST'))
  if (!route) throw new Error('route not found')
  const res = await route.handle(req, url)

  expect(res.headers.get('HX-Redirect')).toBe('/')
  expect(res.status).toBe(200)

  repos.close()
  cleanupTempDir(dir)
})
```

Also update the existing `makeClient` default `getUser` mock to include `expiresAt: null`:

```typescript
function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: 'https://x.com/a.png', expiresAt: null })),
    // ... rest unchanged
  }
}
```

- [ ] **Step 2: Run tests — expect failures**

```bash
bun test tests/unit/routes/auth-route.test.ts
```

Expected: the 2 new tests FAIL; existing 5 tests may also show TS errors.

- [ ] **Step 3: Update auth-route.ts**

Replace `src/routes/auth-route.ts`:

```typescript
import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { GitHubClient } from '../github/github-client.ts'
import { renderSetupPage } from '../templates/page-template.ts'
import { html, redirect } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

export function createAuthRoutes(authRepo: AuthRepo, client: GitHubClient): RouteHandler[] {
  return [
    // GET / — Setup page when not logged in
    {
      match: (url, method) => url.pathname === '/' && method === 'GET' && !authRepo.getToken(),
      handle: () => html(renderSetupPage()),
    },
    // POST /api/auth — Save or delete PAT
    {
      match: (url, method) => url.pathname === '/api/auth' && method === 'POST',
      async handle(req) {
        const form = await req.formData()
        const methodOverride = form.get('_method')

        if (methodOverride === 'DELETE') {
          authRepo.deleteToken()
          return redirect('/')
        }

        const pat = String(form.get('pat') ?? '').trim()
        if (!pat) return html(renderSetupPage('Bitte Token eingeben'), 400)

        try {
          authRepo.saveToken({ pat, username: '', avatarUrl: '', expiresAt: null })
          const user = await client.getUser()
          authRepo.saveToken({ pat, username: user.login, avatarUrl: user.avatarUrl, expiresAt: user.expiresAt })

          if (req.headers.get('HX-Request') === 'true') {
            return new Response(null, { status: 200, headers: { 'HX-Redirect': '/' } })
          }
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

- [ ] **Step 4: Run tests — expect all to pass**

```bash
bun test tests/unit/routes/auth-route.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
bun run check:fix
git add src/routes/auth-route.ts tests/unit/routes/auth-route.test.ts
git commit -m "feat(auth): persist pat expiresAt and support HX-Redirect for modal renewal"
```

---

### Task 5: Update card-route with backfill logic and extend renderDashboard signature

**Files:**
- Modify: `src/routes/card-route.ts`
- Modify: `src/templates/page-template.ts` (signature only — no visual change yet)
- Modify: `src/index.ts`
- Modify: `tests/unit/routes/card-route.test.ts`
- Modify: `tests/unit/templates/page-template.test.ts` (update existing calls)

**Interfaces:**
- Consumes: `GitHubClient.getUser()` (Task 2), `getPatExpirySeverity` (Task 3), `AuthToken.expiresAt` (Task 1)
- Produces: `renderDashboard(cardsHtml, username, avatarUrl, expiresAt, severity)` — consumed by Task 6

- [ ] **Step 1: Write failing tests for backfill**

Add to `describe(...)` in `tests/unit/routes/card-route.test.ts`:

First, update the existing `makeClient` helper (already done in Task 1 — `getUser` must return `expiresAt`). If not already updated:

```typescript
function makeClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getUser: mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt: null })),
    getRepos: mock(async () => []),
    getPrs: mock(async () => []),
    getLastCommitDate: mock(async () => null),
    getCiStatus: mock(async () => 'unknown' as const),
    getDependabotCount: mock(async () => null),
    ...overrides,
  }
}
```

Add tests:

```typescript
test('GET / calls getUser once to backfill expiresAt when it is null', async () => {
  const { dir, dbPath } = createTempDbPath('gh-dash-route-')
  const repos = createSqliteRepos(dbPath)
  repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

  const expiresAt = new Date('2026-12-31T00:00:00.000Z')
  const getUser = mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt }))
  const client = makeClient({ getUser })
  const service = makeCardService(repos)
  const routes = createCardRoutes(service, repos.auth, client)

  const url = new URL('http://localhost:4242/')
  const route = routes.find((r) => r.match(url, 'GET'))
  if (!route) throw new Error('route not found')
  await route.handle(new Request(url.href), url)

  expect(getUser).toHaveBeenCalledTimes(1)
  expect(repos.auth.getToken()?.expiresAt?.toISOString()).toBe('2026-12-31T00:00:00.000Z')

  repos.close()
  cleanupTempDir(dir)
})

test('GET / skips backfill when expiresAt is already set', async () => {
  const { dir, dbPath } = createTempDbPath('gh-dash-route-')
  const repos = createSqliteRepos(dbPath)
  repos.auth.saveToken({
    pat: 'ghp_test', username: 'alice', avatarUrl: '',
    expiresAt: new Date('2026-12-31T00:00:00.000Z'),
  })

  const getUser = mock(async () => ({ login: 'alice', avatarUrl: '', expiresAt: new Date() }))
  const client = makeClient({ getUser })
  const service = makeCardService(repos)
  const routes = createCardRoutes(service, repos.auth, client)

  const url = new URL('http://localhost:4242/')
  const route = routes.find((r) => r.match(url, 'GET'))
  if (!route) throw new Error('route not found')
  await route.handle(new Request(url.href), url)

  expect(getUser).not.toHaveBeenCalled()

  repos.close()
  cleanupTempDir(dir)
})
```

Note: `makeCardService` is a local helper in the test file that creates a `CardService` from `repos` with a default `makeClient()`. Look at how the existing tests create card routes and replicate that pattern — typically `createCardRoutes(createCardService(repos, makeClient()), repos.auth)`. You must now add `client` as the third argument. Add a helper:

```typescript
import { createCardService } from '../../../src/services/card-service.ts'

function makeCardService(repos: ReturnType<typeof createSqliteRepos>) {
  return createCardService(repos, makeClient())
}
```

Also update all existing `createCardRoutes(...)` calls in the file to pass a third `client` argument: `createCardRoutes(service, repos.auth, makeClient())`.

- [ ] **Step 2: Run tests — expect failures**

```bash
bun test tests/unit/routes/card-route.test.ts
```

Expected: FAIL — `createCardRoutes` does not accept a third argument yet.

- [ ] **Step 3: Update createCardRoutes signature and add backfill**

Replace `src/routes/card-route.ts`:

```typescript
import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { GitHubClient } from '../github/github-client.ts'
import type { CardService } from '../services/card-service.ts'
import { getPatExpirySeverity } from '../services/pat-expiry-service.ts'
import {
  renderCard,
  renderCardError,
  renderCards,
  toCardViewModel,
} from '../templates/card-template.ts'
import { renderDashboard } from '../templates/page-template.ts'
import { html, htmxTrigger, redirect } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

export function createCardRoutes(
  cardService: CardService,
  authRepo: AuthRepo,
  client: GitHubClient,
): RouteHandler[] {
  return [
    // GET / — full dashboard
    {
      match: (url, method) => url.pathname === '/' && method === 'GET',
      async handle() {
        let token = authRepo.getToken()
        if (!token) return redirect('/')

        // Backfill expiresAt once for existing users (fires at most once per token)
        if (token.expiresAt === null) {
          try {
            const user = await client.getUser()
            const updated = { ...token, username: user.login, avatarUrl: user.avatarUrl, expiresAt: user.expiresAt }
            authRepo.saveToken(updated)
            token = updated
          } catch {
            // Best effort — don't block dashboard load
          }
        }

        const cards = await cardService.getCards()
        const vms = cards.map(toCardViewModel)
        const severity = token.expiresAt ? getPatExpirySeverity(token.expiresAt, new Date()) : null
        return html(renderDashboard(renderCards(vms), token.username, token.avatarUrl, token.expiresAt, severity))
      },
    },
    // GET /api/cards — HTMX partial for all cards
    {
      match: (url, method) => url.pathname === '/api/cards' && method === 'GET',
      async handle() {
        const cards = await cardService.getCards()
        return html(renderCards(cards.map(toCardViewModel)))
      },
    },
    // GET /api/card/:owner/:repo — single card
    {
      match: (url, method) => method === 'GET' && /^\/api\/card\/[^/]+\/[^/]+$/.test(url.pathname),
      async handle(_req, url) {
        const [, , , owner, repo] = url.pathname.split('/')
        const fullName = `${owner}/${repo}`
        try {
          const data = await cardService.getCard(fullName)
          return html(renderCard(toCardViewModel(data)))
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Fehler beim Laden'
          return html(renderCardError(fullName, msg))
        }
      },
    },
    // POST /api/cards/:owner/:repo — pin/unpin toggle
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

- [ ] **Step 4: Update renderDashboard signature (backward-compatible)**

In `src/templates/page-template.ts`, update the function signature to accept two new optional params (no visual change yet — icon/modal added in Task 6):

```typescript
import type { PatExpirySeverity } from '../services/pat-expiry-service.ts'

export function renderDashboard(
  cardsHtml: string,
  username: string,
  avatarUrl: string,
  expiresAt: Date | null = null,
  severity: PatExpirySeverity | null = null,
): string {
  // body unchanged for now
}
```

- [ ] **Step 5: Update index.ts to pass client**

In `src/index.ts`, change:
```typescript
...createCardRoutes(cardService, repos.auth),
```
to:
```typescript
...createCardRoutes(cardService, repos.auth, client),
```

- [ ] **Step 6: Run tests — expect all to pass**

```bash
bun test tests/unit/routes/card-route.test.ts
bun test tests/unit/templates/page-template.test.ts
bun x tsc --noEmit
```

Expected: all pass. The existing `page-template` tests pass because the new params are optional.

- [ ] **Step 7: Commit**

```bash
bun run check:fix
git add src/routes/card-route.ts src/templates/page-template.ts src/index.ts \
  tests/unit/routes/card-route.test.ts
git commit -m "feat(dashboard): backfill pat expiresAt on first load and compute severity"
```

---

### Task 6: Render expiry icon and renewal modal in renderDashboard

**Files:**
- Modify: `src/templates/page-template.ts`
- Modify: `tests/unit/templates/page-template.test.ts`

**Interfaces:**
- Consumes: `PatExpirySeverity` (Task 3), `expiresAt: Date | null`, `severity: PatExpirySeverity | null` (Task 5)

- [ ] **Step 1: Write failing tests for the icon and modal**

Add to `describe('renderDashboard', ...)` in `tests/unit/templates/page-template.test.ts`:

```typescript
test('renders no expiry icon when expiresAt is null', () => {
  const html = renderDashboard('', 'alice', '', null, null)
  expect(html).not.toContain('pat-modal')
})

test('renders expiry icon with info color when severity is info', () => {
  const expiresAt = new Date(Date.now() + 30 * 86_400_000)
  const html = renderDashboard('', 'alice', '', expiresAt, 'info')
  expect(html).toContain('#388bfd')
  expect(html).toContain('pat-modal')
})

test('renders expiry icon with notice color when severity is notice', () => {
  const expiresAt = new Date(Date.now() + 10 * 86_400_000)
  const html = renderDashboard('', 'alice', '', expiresAt, 'notice')
  expect(html).toContain('#d29922')
})

test('renders expiry icon with warning color when severity is warning', () => {
  const expiresAt = new Date(Date.now() + 1 * 86_400_000)
  const html = renderDashboard('', 'alice', '', expiresAt, 'warning')
  expect(html).toContain('#f85149')
})

test('icon title contains days remaining and expiry date', () => {
  const expiresAt = new Date('2026-12-31T00:00:00.000Z')
  const html = renderDashboard('', 'alice', '', expiresAt, 'info')
  expect(html).toContain('2026-12-31')
})

test('renewal modal contains link to GitHub token settings', () => {
  const expiresAt = new Date(Date.now() + 30 * 86_400_000)
  const html = renderDashboard('', 'alice', '', expiresAt, 'info')
  expect(html).toContain('https://github.com/settings/tokens')
})

test('renewal modal contains PAT input form that posts to /api/auth', () => {
  const expiresAt = new Date(Date.now() + 30 * 86_400_000)
  const html = renderDashboard('', 'alice', '', expiresAt, 'info')
  expect(html).toContain('hx-post="/api/auth"')
  expect(html).toContain('type="password"')
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
bun test tests/unit/templates/page-template.test.ts
```

Expected: the 7 new tests FAIL — no icon or modal rendered yet.

- [ ] **Step 3: Add icon and modal to renderDashboard**

Update `src/templates/page-template.ts`. Add a helper at the top of the file (after the imports):

```typescript
const SEVERITY_COLOR: Record<import('./pat-expiry-service.ts').PatExpirySeverity, string> = {
  info: '#388bfd',
  notice: '#d29922',
  warning: '#f85149',
}
```

Wait — to avoid a circular import, import from `src/services/pat-expiry-service.ts` directly. The import is already added in Task 5.

Add two helper functions near the top of the module (after the `CLIENT_SCRIPT` const):

```typescript
function formatExpiryDate(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

function daysUntilExpiry(d: Date): number {
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}
```

In `renderDashboard`, just before the closing `</header>` tag (after the logout form), insert:

```typescript
${severity && expiresAt ? (() => {
  const color = { info: '#388bfd', notice: '#d29922', warning: '#f85149' }[severity]
  const days = daysUntilExpiry(expiresAt)
  const dateStr = formatExpiryDate(expiresAt)
  const label = days <= 0 ? 'expired' : `in ${days} day${days === 1 ? '' : 's'}`
  return `<button
    onclick="document.getElementById('pat-modal').style.display='flex'"
    title="Token expires ${label} (${dateStr})"
    style="background:transparent;border:none;cursor:pointer;padding:2px;display:flex;
           align-items:center;color:${color};flex-shrink:0"
    aria-label="PAT expiry warning">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 1.5a6.5 6.5 0 110 13 6.5 6.5 0 010-13zM7.25 4v5.25l3.5 2.1.75-1.23-2.75-1.65V4h-1.5z"/>
    </svg>
  </button>`
})() : ''}
```

And add the modal HTML just before `<div id="modal">` in the body:

```typescript
${severity && expiresAt ? (() => {
  const color = { info: '#388bfd', notice: '#d29922', warning: '#f85149' }[severity]
  const days = daysUntilExpiry(expiresAt)
  const dateStr = formatExpiryDate(expiresAt)
  const label = days <= 0 ? 'Your token has expired' : `Your token expires on ${dateStr} (in ${days} day${days === 1 ? '' : 's'})`
  return `<div id="pat-modal"
    style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;
           align-items:center;justify-content:center"
    onclick="if(event.target===this)this.style.display='none'">
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;width:100%;
                max-width:480px;margin:16px;padding:24px">
      <div style="font-size:16px;font-weight:600;margin-bottom:16px">Personal Access Token</div>
      <p style="color:${color};font-size:13px;margin:0 0 16px">${label}</p>
      <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer"
         style="color:#388bfd;font-size:13px;display:block;margin-bottom:20px">
        Create a new token on GitHub →
      </a>
      <form hx-post="/api/auth" hx-target="body">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">
          New Personal Access Token
        </label>
        <input name="pat" type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" required
               style="width:100%;background:#0d1117;border:1px solid #30363d;border-radius:6px;
                      padding:9px 12px;color:#e6edf3;font-size:13px;font-family:monospace;
                      outline:none;margin-bottom:12px"/>
        <button type="submit" class="btn-primary" style="width:100%;padding:10px">
          Renew Token
        </button>
      </form>
    </div>
  </div>`
})() : ''}`
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
bun test tests/unit/templates/page-template.test.ts
```

Expected: all tests pass (7 original + 7 new = 14 total).

- [ ] **Step 5: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass (≥ 156 + new tests).

- [ ] **Step 6: Commit**

```bash
bun run check:fix
git add src/templates/page-template.ts tests/unit/templates/page-template.test.ts
git commit -m "feat(ui): render pat expiry icon and renewal modal in dashboard header"
```

---

### Task 7: Update seed-db and add e2e tests

**Files:**
- Modify: `tests/e2e/seed-db.ts`
- Modify: `tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Update seed-db to accept patExpiresAt**

In `tests/e2e/seed-db.ts`, change the `seedTestDb` function signature and the `saveToken` call:

```typescript
export function seedTestDb(dbPath: string, opts: { patExpiresAt?: Date } = {}): void {
  const repos = createSqliteRepos(dbPath)

  // Auth
  repos.auth.saveToken({
    pat: TEST_PAT,
    username: TEST_USER,
    avatarUrl: TEST_AVATAR,
    expiresAt: opts.patExpiresAt ?? null,
  })

  // … rest of the function unchanged …
}
```

- [ ] **Step 2: Write e2e tests**

Add a new `describe` block to `tests/e2e/dashboard.spec.ts`:

```typescript
test.describe('PAT expiry icon', () => {
  test('shows no expiry icon when expiresAt is null', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[aria-label="PAT expiry warning"]')).not.toBeVisible()
  })
})
```

For the severity and modal tests, you need to seed a DB with specific expiry dates. The e2e setup uses a seeded DB from `tests/e2e/seed-db.ts` that is created once per test run. Since different tests need different expiry dates, use `page.evaluate` to call the test restore endpoint and then directly manipulate the DB via a test API — however, the simpler approach is to rely on the `restore-session` endpoint which calls `saveToken` with `expiresAt: null`.

For the expiry-specific tests, create a separate test fixture that seeds the DB with an expiry date by adding a dedicated test-only endpoint. Instead, test the icon visibility by checking the page HTML after the `restore-session` seeding sets `expiresAt: null`:

```typescript
test.describe('PAT expiry icon', () => {
  test('no icon shown when session has no expiry date', async ({ page }) => {
    // restore-session seeds expiresAt: null
    await page.goto('/')
    await expect(page.locator('[aria-label="PAT expiry warning"]')).not.toBeVisible()
  })
})
```

For the modal and renewal form, add a helper test route in `src/index.ts` (inside the `PLAYWRIGHT_TEST` block) that sets an expiry date:

In `src/index.ts`, inside the `if (process.env.PLAYWRIGHT_TEST === '1')` block, add after the existing restore-session route:

```typescript
routes.push({
  match: (url, method) => url.pathname === '/api/test/set-expiry' && method === 'POST',
  async handle(req) {
    const body = (await req.json()) as { daysFromNow: number }
    const token = repos.auth.getToken()
    if (!token) return new Response('no token', { status: 400 })
    const expiresAt = new Date(Date.now() + body.daysFromNow * 86_400_000)
    repos.auth.saveToken({ ...token, expiresAt })
    return new Response('ok')
  },
})
```

Then add e2e tests for each severity:

```typescript
test.describe('PAT expiry icon', () => {
  test('no icon shown when session has no expiry date', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[aria-label="PAT expiry warning"]')).not.toBeVisible()
  })

  test('shows info icon (blue) when expiry is more than 21 days away', async ({ page }) => {
    await page.request.post('/api/test/set-expiry', {
      data: JSON.stringify({ daysFromNow: 30 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await page.goto('/')
    const icon = page.locator('[aria-label="PAT expiry warning"]')
    await expect(icon).toBeVisible()
    const color = await icon.evaluate((el) => (el as HTMLElement).style.color)
    expect(color).toContain('rgb(56, 139, 253)')
  })

  test('shows notice icon (amber) when expiry is 4–21 days away', async ({ page }) => {
    await page.request.post('/api/test/set-expiry', {
      data: JSON.stringify({ daysFromNow: 10 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await page.goto('/')
    const icon = page.locator('[aria-label="PAT expiry warning"]')
    await expect(icon).toBeVisible()
    const style = await icon.getAttribute('style')
    expect(style).toContain('#d29922')
  })

  test('shows warning icon (red) when expiry is 3 days or less', async ({ page }) => {
    await page.request.post('/api/test/set-expiry', {
      data: JSON.stringify({ daysFromNow: 2 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await page.goto('/')
    const icon = page.locator('[aria-label="PAT expiry warning"]')
    await expect(icon).toBeVisible()
    const style = await icon.getAttribute('style')
    expect(style).toContain('#f85149')
  })

  test('clicking icon opens the renewal modal', async ({ page }) => {
    await page.request.post('/api/test/set-expiry', {
      data: JSON.stringify({ daysFromNow: 2 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await page.goto('/')
    await page.locator('[aria-label="PAT expiry warning"]').click()
    await expect(page.locator('#pat-modal')).toBeVisible()
    await expect(page.getByText('Create a new token on GitHub →')).toBeVisible()
    await expect(page.locator('#pat-modal input[name="pat"]')).toBeVisible()
  })

  test('clicking modal backdrop closes it', async ({ page }) => {
    await page.request.post('/api/test/set-expiry', {
      data: JSON.stringify({ daysFromNow: 2 }),
      headers: { 'Content-Type': 'application/json' },
    })
    await page.goto('/')
    await page.locator('[aria-label="PAT expiry warning"]').click()
    await expect(page.locator('#pat-modal')).toBeVisible()
    // Click the backdrop (the overlay element itself, not the inner dialog)
    await page.locator('#pat-modal').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('#pat-modal')).not.toBeVisible()
  })
})
```

Note: the info color test checks `style.color` which browsers convert to `rgb(56, 139, 253)` from hex `#388bfd`. The notice and warning tests check the `style` attribute directly (set as inline style on the button in the template), which retains the hex string.

- [ ] **Step 3: Run e2e tests**

```bash
bun run test:e2e
```

Expected: all e2e tests pass including the new PAT expiry tests.

- [ ] **Step 4: Commit**

```bash
bun run check:fix
git add tests/e2e/seed-db.ts tests/e2e/dashboard.spec.ts src/index.ts
git commit -m "test(e2e): add pat expiry icon and modal tests"
```

---

## Verification

```bash
bun test tests/unit        # all unit tests pass
bun run test:e2e           # all e2e tests pass (icon, modal, backdrop close)
bun run check              # Biome clean
bun x tsc --noEmit         # no type errors
```

Manual smoke test:
1. `bun run dev`
2. Log in with a PAT that has an expiry
3. Hover the clock icon → tooltip shows expiry date + days remaining
4. Click the icon → renewal modal opens with GitHub link + PAT form
5. Enter a new PAT → modal submits → page reloads with updated severity (or no icon if new PAT has no expiry)
6. Existing users: first load triggers a backfill call (visible in server logs as a single `GET /user`)
