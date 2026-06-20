# GitHub Dashboard — Phase 2: DB-Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vollständige Datenbankschicht — Domain-Typen, SQLite-Migrations, Repository-Interfaces und ihre Implementierungen.

**Architecture:** Jedes Repository kapselt alle DB-Zugriffe für seine Domain. Die Factory `createSqliteRepos(dbPath)` ist die einzige Stelle, die eine DB-Connection öffnet. Unit-Tests verwenden echte SQLite-DBs in temporären Verzeichnissen.

**Tech Stack:** `bun:sqlite`, Bun test, TypeScript strict

## Global Constraints

- Alle Domain-Typen sind `readonly`
- DB-Zugriff ausschließlich über Repository-Methoden
- Unit-Tests: echte SQLite, kein Mocking der DB
- Jede Repo-Implementierung bekommt eine `Database`-Instanz injiziert
- `PRAGMA journal_mode = WAL` für alle DBs

---

## File Map

```
src/db/
  types.ts                          ← Alle Domain-Typen
  repos.ts                          ← Repos-Interface (zentraler Einstiegspunkt)
  migrations.ts                     ← runMigrations(db), versioned via PRAGMA user_version
  sqlite-repository.ts              ← createSqliteRepos(dbPath): Repos
  auth/
    auth-repo.ts                    ← AuthRepo Interface
    sqlite-auth-repo.ts             ← Konkrete SQLite-Implementierung
  cards/
    card-repo.ts                    ← CardRepo Interface
    sqlite-card-repo.ts
  pull-requests/
    pr-repo.ts                      ← PrRepo Interface
    sqlite-pr-repo.ts
  dependabot/
    dependabot-repo.ts              ← DependabotRepo Interface
    sqlite-dependabot-repo.ts

tests/unit/
  helpers/
    temp-db.ts                      ← createTempDbPath / cleanupTempDir
  db/
    auth-repo.test.ts
    card-repo.test.ts
    pr-repo.test.ts
    dependabot-repo.test.ts
    migrations.test.ts
```

---

### Task 4: Domain-Typen + Migrations + Factory

**Files:**
- Create: `src/db/types.ts`
- Create: `src/db/repos.ts`
- Create: `src/db/migrations.ts`
- Create: `src/db/sqlite-repository.ts`
- Create: `tests/unit/helpers/temp-db.ts`
- Create: `tests/unit/db/migrations.test.ts`

**Interfaces:**
- Produces: `createSqliteRepos(dbPath): Repos`, `runMigrations(db)`, alle Domain-Typen als named exports aus `src/db/types.ts`

- [ ] **Step 1: Domain-Typen schreiben**

```typescript
// src/db/types.ts
export type CiStatus = 'success' | 'failure' | 'pending' | 'unknown'

export type Label = {
  readonly name: string
  readonly color: string // hex ohne '#', z.B. '3fb950'
}

export type AuthToken = {
  readonly pat: string
  readonly username: string
  readonly avatarUrl: string
}

export type PinnedRepo = {
  readonly fullName: string
  readonly sortOrder: number
  readonly pinnedAt: Date
}

export type RepoCache = {
  readonly fullName: string
  readonly lastCommitAt: Date | null
  readonly prTotal: number
  readonly dependabotCount: number | null // null = kein security_events Scope
  readonly cachedAt: Date
}

export type RepoCacheUpdate = {
  readonly lastCommitAt: Date | null
  readonly prTotal: number
  readonly dependabotCount: number | null
}

export type PullRequest = {
  readonly repoFullName: string
  readonly number: number
  readonly title: string
  readonly draft: boolean
  readonly ciStatus: CiStatus
  readonly prUrl: string
  readonly creator: string
  readonly labels: ReadonlyArray<Label>
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type DependabotSnapshot = {
  readonly repoFullName: string
  readonly count: number
  readonly recordedAt: Date
}

export type DependabotTrend = {
  readonly week: number | null
  readonly month: number | null
  readonly sixMonths: number | null
}
```

- [ ] **Step 2: Repos-Interface schreiben**

```typescript
// src/db/repos.ts
import type { AuthRepo } from './auth/auth-repo.ts'
import type { CardRepo } from './cards/card-repo.ts'
import type { PrRepo } from './pull-requests/pr-repo.ts'
import type { DependabotRepo } from './dependabot/dependabot-repo.ts'

export interface Repos {
  readonly auth: AuthRepo
  readonly cards: CardRepo
  readonly pullRequests: PrRepo
  readonly dependabot: DependabotRepo
  close(): void
}
```

- [ ] **Step 3: Migrations schreiben**

```typescript
// src/db/migrations.ts
import type { Database } from 'bun:sqlite'

type Migration = (db: Database) => void

const MIGRATIONS: Migration[] = [
  // v1: initial schema
  (db) => {
    db.run(`CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`)
    db.run(`CREATE TABLE pinned_repos (
      full_name  TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      pinned_at  TEXT NOT NULL
    )`)
    db.run(`CREATE TABLE repo_cache (
      full_name         TEXT PRIMARY KEY,
      last_commit_at    TEXT,
      pr_total          INTEGER NOT NULL DEFAULT 0,
      dependabot_count  INTEGER,
      cached_at         TEXT NOT NULL
    )`)
    db.run(`CREATE TABLE pull_requests (
      repo_full_name  TEXT NOT NULL,
      number          INTEGER NOT NULL,
      title           TEXT NOT NULL,
      draft           INTEGER NOT NULL DEFAULT 0,
      ci_status       TEXT NOT NULL DEFAULT 'unknown',
      pr_url          TEXT NOT NULL,
      creator         TEXT NOT NULL,
      labels          TEXT NOT NULL DEFAULT '[]',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      PRIMARY KEY (repo_full_name, number)
    )`)
    db.run(`CREATE TABLE dependabot_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_full_name  TEXT NOT NULL,
      count           INTEGER NOT NULL,
      recorded_at     TEXT NOT NULL
    )`)
  },
]

export function runMigrations(db: Database): void {
  const row = db.query<{ user_version: number }, []>('PRAGMA user_version').get()
  const version = row?.user_version ?? 0
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      MIGRATIONS[i]!(db)
      db.run(`PRAGMA user_version = ${i + 1}`)
    })()
  }
}
```

- [ ] **Step 4: Test-Helper erstellen**

```typescript
// tests/unit/helpers/temp-db.ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function createTempDbPath(prefix: string): { dir: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  return { dir, dbPath: join(dir, 'github-dashboard.db') }
}

export function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
```

- [ ] **Step 5: Migrations-Test schreiben**

```typescript
// tests/unit/db/migrations.test.ts
import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { runMigrations } from '../../../src/db/migrations.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

describe('runMigrations', () => {
  const cleanup: string[] = []
  afterEach(() => { cleanup.splice(0).forEach(cleanupTempDir) })

  test('creates all tables on fresh database', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-migrations-')
    cleanup.push(dir)
    const db = new Database(dbPath)

    runMigrations(db)

    const tables = db
      .query<{ name: string }, []>(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all()
      .map((r) => r.name)

    expect(tables).toContain('settings')
    expect(tables).toContain('pinned_repos')
    expect(tables).toContain('repo_cache')
    expect(tables).toContain('pull_requests')
    expect(tables).toContain('dependabot_history')

    db.close()
  })

  test('sets user_version after migration', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-migrations-')
    cleanup.push(dir)
    const db = new Database(dbPath)

    runMigrations(db)

    const row = db.query<{ user_version: number }, []>('PRAGMA user_version').get()
    expect(row?.user_version).toBe(1)
    db.close()
  })

  test('is idempotent — running twice does not throw', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-migrations-')
    cleanup.push(dir)
    const db = new Database(dbPath)

    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
    db.close()
  })
})
```

- [ ] **Step 6: Test ausführen (muss fehlschlagen — Imports noch nicht vorhanden)**

```bash
bun test tests/unit/db/migrations.test.ts
```

Erwartete Ausgabe: Fehler wegen fehlender Imports (noch nicht implementiert). Das ist korrekt für TDD.

- [ ] **Step 7: Factory erstellen (Platzhalter — wird nach den Repos vervollständigt)**

```typescript
// src/db/sqlite-repository.ts
import { Database } from 'bun:sqlite'
import { runMigrations } from './migrations.ts'
import { createSqliteAuthRepo } from './auth/sqlite-auth-repo.ts'
import { createSqliteCardRepo } from './cards/sqlite-card-repo.ts'
import { createSqlitePrRepo } from './pull-requests/sqlite-pr-repo.ts'
import { createSqliteDependabotRepo } from './dependabot/sqlite-dependabot-repo.ts'
import type { Repos } from './repos.ts'

export function createSqliteRepos(dbPath: string): Repos {
  const db = new Database(dbPath, { create: true })
  db.run('PRAGMA journal_mode = WAL')
  runMigrations(db)
  return {
    auth: createSqliteAuthRepo(db),
    cards: createSqliteCardRepo(db),
    pullRequests: createSqlitePrRepo(db),
    dependabot: createSqliteDependabotRepo(db),
    close() {
      db.close()
    },
  }
}
```

- [ ] **Step 8: Tests laufen lassen**

```bash
bun test tests/unit/db/migrations.test.ts
```

Erwartete Ausgabe: 3 passing tests.

- [ ] **Step 9: Commit**

```bash
git add src/db/types.ts src/db/repos.ts src/db/migrations.ts \
        src/db/sqlite-repository.ts tests/unit/helpers/ tests/unit/db/migrations.test.ts
git commit -m "feat(db): add domain types, migrations, and sqlite factory"
```

---

### Task 5: Auth Repository

**Files:**
- Create: `src/db/auth/auth-repo.ts`
- Create: `src/db/auth/sqlite-auth-repo.ts`
- Create: `tests/unit/db/auth-repo.test.ts`

**Interfaces:**
- Consumes: `Database` (bun:sqlite), `AuthToken` aus `src/db/types.ts`
- Produces: `AuthRepo` interface, `createSqliteAuthRepo(db): AuthRepo`

- [ ] **Step 1: Interface schreiben**

```typescript
// src/db/auth/auth-repo.ts
import type { AuthToken } from '../types.ts'

export interface AuthRepo {
  getToken(): AuthToken | null
  saveToken(token: AuthToken): void
  deleteToken(): void
}
```

- [ ] **Step 2: Test schreiben**

```typescript
// tests/unit/db/auth-repo.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

describe('AuthRepo', () => {
  const cleanup: string[] = []
  afterEach(() => { cleanup.splice(0).forEach(cleanupTempDir) })

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

    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: 'https://example.com/avatar.png' })
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

    repos.auth.saveToken({ pat: 'old', username: 'old', avatarUrl: 'old' })
    repos.auth.saveToken({ pat: 'new', username: 'new', avatarUrl: 'new' })

    expect(repos.auth.getToken()?.pat).toBe('new')

    repos.close()
  })

  test('deleteToken removes token', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auth-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: 'https://example.com/avatar.png' })
    repos.auth.deleteToken()

    expect(repos.auth.getToken()).toBeNull()

    repos.close()
  })
})
```

- [ ] **Step 3: Test ausführen (muss fehlschlagen)**

```bash
bun test tests/unit/db/auth-repo.test.ts
```

Erwartete Ausgabe: Fehler, da `sqlite-auth-repo.ts` noch nicht existiert.

- [ ] **Step 4: Implementierung schreiben**

```typescript
// src/db/auth/sqlite-auth-repo.ts
import type { Database } from 'bun:sqlite'
import type { AuthToken } from '../types.ts'
import type { AuthRepo } from './auth-repo.ts'

type SettingsRow = { value: string }

export function createSqliteAuthRepo(db: Database): AuthRepo {
  const get = db.query<SettingsRow, [string]>('SELECT value FROM settings WHERE key = ?')
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

  return {
    getToken() {
      const pat = get.get('pat')?.value
      const username = get.get('username')?.value
      const avatarUrl = get.get('avatar_url')?.value
      if (!pat || !username || !avatarUrl) return null
      return { pat, username, avatarUrl }
    },

    saveToken(token) {
      db.transaction(() => {
        upsert.run('pat', token.pat)
        upsert.run('username', token.username)
        upsert.run('avatar_url', token.avatarUrl)
      })()
    },

    deleteToken() {
      db.run("DELETE FROM settings WHERE key IN ('pat', 'username', 'avatar_url')")
    },
  }
}
```

- [ ] **Step 5: Tests laufen lassen**

```bash
bun test tests/unit/db/auth-repo.test.ts
```

Erwartete Ausgabe: 4 passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/db/auth/ tests/unit/db/auth-repo.test.ts
git commit -m "feat(db): add auth repository with sqlite implementation"
```

---

### Task 6: Card Repository

**Files:**
- Create: `src/db/cards/card-repo.ts`
- Create: `src/db/cards/sqlite-card-repo.ts`
- Create: `tests/unit/db/card-repo.test.ts`

**Interfaces:**
- Consumes: `Database`, `PinnedRepo` aus `types.ts`
- Produces: `CardRepo` interface, `createSqliteCardRepo(db): CardRepo`

- [ ] **Step 1: Interface schreiben**

```typescript
// src/db/cards/card-repo.ts
import type { PinnedRepo } from '../types.ts'

export interface CardRepo {
  getPinned(): PinnedRepo[]
  isPinned(fullName: string): boolean
  pin(fullName: string): void
  unpin(fullName: string): void
  reorder(fullNames: string[]): void // setzt sort_order nach Array-Position
}
```

- [ ] **Step 2: Test schreiben**

```typescript
// tests/unit/db/card-repo.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

describe('CardRepo', () => {
  const cleanup: string[] = []
  afterEach(() => { cleanup.splice(0).forEach(cleanupTempDir) })

  test('getPinned returns empty array initially', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    expect(repos.cards.getPinned()).toEqual([])
    repos.close()
  })

  test('pin adds a repo and isPinned reflects it', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.cards.pin('alice/alpha')

    expect(repos.cards.isPinned('alice/alpha')).toBe(true)
    expect(repos.cards.isPinned('alice/beta')).toBe(false)
    expect(repos.cards.getPinned()).toHaveLength(1)
    repos.close()
  })

  test('pin is idempotent', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.cards.pin('alice/alpha')
    repos.cards.pin('alice/alpha')

    expect(repos.cards.getPinned()).toHaveLength(1)
    repos.close()
  })

  test('unpin removes a repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.cards.pin('alice/alpha')
    repos.cards.unpin('alice/alpha')

    expect(repos.cards.isPinned('alice/alpha')).toBe(false)
    repos.close()
  })

  test('reorder changes sort_order', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.cards.pin('alice/beta')
    repos.cards.pin('alice/alpha')
    repos.cards.reorder(['alice/alpha', 'alice/beta'])

    const pinned = repos.cards.getPinned()
    expect(pinned.map((r) => r.fullName)).toEqual(['alice/alpha', 'alice/beta'])
    repos.close()
  })

  test('getPinned sorts by sort_order ascending', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.cards.pin('first')
    repos.cards.pin('second')
    repos.cards.pin('third')

    const names = repos.cards.getPinned().map((r) => r.fullName)
    expect(names).toEqual(['first', 'second', 'third'])
    repos.close()
  })
})
```

- [ ] **Step 3: Test ausführen (muss fehlschlagen)**

```bash
bun test tests/unit/db/card-repo.test.ts
```

- [ ] **Step 4: Implementierung schreiben**

```typescript
// src/db/cards/sqlite-card-repo.ts
import type { Database } from 'bun:sqlite'
import type { PinnedRepo } from '../types.ts'
import type { CardRepo } from './card-repo.ts'

type PinnedRow = { full_name: string; sort_order: number; pinned_at: string }

export function createSqliteCardRepo(db: Database): CardRepo {
  const selectAll = db.query<PinnedRow, []>(
    'SELECT full_name, sort_order, pinned_at FROM pinned_repos ORDER BY sort_order ASC',
  )
  const selectOne = db.query<{ count: number }, [string]>(
    'SELECT COUNT(*) as count FROM pinned_repos WHERE full_name = ?',
  )
  const maxOrder = db.query<{ max: number | null }, []>(
    'SELECT MAX(sort_order) as max FROM pinned_repos',
  )

  return {
    getPinned() {
      return selectAll.all().map((row) => ({
        fullName: row.full_name,
        sortOrder: row.sort_order,
        pinnedAt: new Date(row.pinned_at),
      }))
    },

    isPinned(fullName) {
      return (selectOne.get(fullName)?.count ?? 0) > 0
    },

    pin(fullName) {
      const nextOrder = (maxOrder.get()?.max ?? -1) + 1
      db.run(
        'INSERT OR IGNORE INTO pinned_repos (full_name, sort_order, pinned_at) VALUES (?, ?, ?)',
        [fullName, nextOrder, new Date().toISOString()],
      )
    },

    unpin(fullName) {
      db.run('DELETE FROM pinned_repos WHERE full_name = ?', [fullName])
    },

    reorder(fullNames) {
      db.transaction(() => {
        fullNames.forEach((name, i) => {
          db.run('UPDATE pinned_repos SET sort_order = ? WHERE full_name = ?', [i, name])
        })
      })()
    },
  }
}
```

- [ ] **Step 5: Tests laufen lassen**

```bash
bun test tests/unit/db/card-repo.test.ts
```

Erwartete Ausgabe: 6 passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/db/cards/ tests/unit/db/card-repo.test.ts
git commit -m "feat(db): add card repository with pin, unpin, reorder"
```

---

### Task 7: PR Repository

**Files:**
- Create: `src/db/pull-requests/pr-repo.ts`
- Create: `src/db/pull-requests/sqlite-pr-repo.ts`
- Create: `tests/unit/db/pr-repo.test.ts`

**Interfaces:**
- Consumes: `Database`, `PullRequest`, `RepoCache`, `RepoCacheUpdate` aus `types.ts`
- Produces: `PrRepo` interface, `createSqlitePrRepo(db): PrRepo`

- [ ] **Step 1: Interface schreiben**

```typescript
// src/db/pull-requests/pr-repo.ts
import type { PullRequest, RepoCache, RepoCacheUpdate } from '../types.ts'

export interface PrRepo {
  getCache(fullName: string): RepoCache | null
  upsertCache(fullName: string, data: RepoCacheUpdate): void
  getPrs(fullName: string): PullRequest[]
  upsertPrs(fullName: string, prs: ReadonlyArray<PullRequest>): void
}
```

- [ ] **Step 2: Test schreiben**

```typescript
// tests/unit/db/pr-repo.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import type { PullRequest } from '../../../src/db/types.ts'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

const makePr = (number: number): PullRequest => ({
  repoFullName: 'alice/alpha',
  number,
  title: `PR #${number}`,
  draft: false,
  ciStatus: 'success',
  prUrl: `https://github.com/alice/alpha/pull/${number}`,
  creator: 'bob',
  labels: [{ name: 'bug', color: 'f85149' }],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
})

describe('PrRepo', () => {
  const cleanup: string[] = []
  afterEach(() => { cleanup.splice(0).forEach(cleanupTempDir) })

  test('getCache returns null for unknown repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    expect(repos.pullRequests.getCache('alice/alpha')).toBeNull()
    repos.close()
  })

  test('upsertCache stores and retrieves cache', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    const now = new Date('2026-06-20T12:00:00Z')
    repos.pullRequests.upsertCache('alice/alpha', {
      lastCommitAt: now,
      prTotal: 3,
      dependabotCount: 5,
    })

    const cache = repos.pullRequests.getCache('alice/alpha')
    expect(cache?.prTotal).toBe(3)
    expect(cache?.dependabotCount).toBe(5)
    expect(cache?.lastCommitAt?.toISOString()).toBe(now.toISOString())
    repos.close()
  })

  test('upsertPrs replaces existing PRs for a repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.pullRequests.upsertPrs('alice/alpha', [makePr(1), makePr(2)])
    repos.pullRequests.upsertPrs('alice/alpha', [makePr(3)]) // replaces

    const prs = repos.pullRequests.getPrs('alice/alpha')
    expect(prs).toHaveLength(1)
    expect(prs[0]?.number).toBe(3)
    repos.close()
  })

  test('upsertPrs preserves labels as JSON', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.pullRequests.upsertPrs('alice/alpha', [makePr(1)])
    const pr = repos.pullRequests.getPrs('alice/alpha')[0]

    expect(pr?.labels).toEqual([{ name: 'bug', color: 'f85149' }])
    repos.close()
  })

  test('upsertPrs for different repos are independent', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    const prB = { ...makePr(99), repoFullName: 'alice/beta' }
    repos.pullRequests.upsertPrs('alice/alpha', [makePr(1)])
    repos.pullRequests.upsertPrs('alice/beta', [prB])

    expect(repos.pullRequests.getPrs('alice/alpha')).toHaveLength(1)
    expect(repos.pullRequests.getPrs('alice/beta')).toHaveLength(1)
    repos.close()
  })
})
```

- [ ] **Step 3: Test ausführen (muss fehlschlagen)**

```bash
bun test tests/unit/db/pr-repo.test.ts
```

- [ ] **Step 4: Implementierung schreiben**

```typescript
// src/db/pull-requests/sqlite-pr-repo.ts
import type { Database } from 'bun:sqlite'
import type { Label, PullRequest, RepoCache, RepoCacheUpdate } from '../types.ts'
import type { PrRepo } from './pr-repo.ts'

type CacheRow = {
  full_name: string
  last_commit_at: string | null
  pr_total: number
  dependabot_count: number | null
  cached_at: string
}

type PrRow = {
  repo_full_name: string
  number: number
  title: string
  draft: number
  ci_status: string
  pr_url: string
  creator: string
  labels: string
  created_at: string
  updated_at: string
}

export function createSqlitePrRepo(db: Database): PrRepo {
  return {
    getCache(fullName) {
      const row = db
        .query<CacheRow, [string]>('SELECT * FROM repo_cache WHERE full_name = ?')
        .get(fullName)
      if (!row) return null
      return {
        fullName: row.full_name,
        lastCommitAt: row.last_commit_at ? new Date(row.last_commit_at) : null,
        prTotal: row.pr_total,
        dependabotCount: row.dependabot_count,
        cachedAt: new Date(row.cached_at),
      }
    },

    upsertCache(fullName, data) {
      db.run(
        `INSERT OR REPLACE INTO repo_cache
         (full_name, last_commit_at, pr_total, dependabot_count, cached_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          fullName,
          data.lastCommitAt?.toISOString() ?? null,
          data.prTotal,
          data.dependabotCount,
          new Date().toISOString(),
        ],
      )
    },

    getPrs(fullName) {
      return db
        .query<PrRow, [string]>('SELECT * FROM pull_requests WHERE repo_full_name = ?')
        .all(fullName)
        .map((row) => ({
          repoFullName: row.repo_full_name,
          number: row.number,
          title: row.title,
          draft: row.draft === 1,
          ciStatus: row.ci_status as PullRequest['ciStatus'],
          prUrl: row.pr_url,
          creator: row.creator,
          labels: JSON.parse(row.labels) as Label[],
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        }))
    },

    upsertPrs(fullName, prs) {
      db.transaction(() => {
        db.run('DELETE FROM pull_requests WHERE repo_full_name = ?', [fullName])
        for (const pr of prs) {
          db.run(
            `INSERT INTO pull_requests
             (repo_full_name, number, title, draft, ci_status, pr_url, creator, labels, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              pr.repoFullName,
              pr.number,
              pr.title,
              pr.draft ? 1 : 0,
              pr.ciStatus,
              pr.prUrl,
              pr.creator,
              JSON.stringify(pr.labels),
              pr.createdAt.toISOString(),
              pr.updatedAt.toISOString(),
            ],
          )
        }
      })()
    },
  }
}
```

- [ ] **Step 5: Tests laufen lassen**

```bash
bun test tests/unit/db/pr-repo.test.ts
```

Erwartete Ausgabe: 5 passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/db/pull-requests/ tests/unit/db/pr-repo.test.ts
git commit -m "feat(db): add PR and repo cache repository"
```

---

### Task 8: Dependabot Repository

**Files:**
- Create: `src/db/dependabot/dependabot-repo.ts`
- Create: `src/db/dependabot/sqlite-dependabot-repo.ts`
- Create: `tests/unit/db/dependabot-repo.test.ts`

**Interfaces:**
- Consumes: `Database`, `DependabotSnapshot` aus `types.ts`
- Produces: `DependabotRepo` interface, `createSqliteDependabotRepo(db): DependabotRepo`

- [ ] **Step 1: Interface schreiben**

```typescript
// src/db/dependabot/dependabot-repo.ts
import type { DependabotSnapshot } from '../types.ts'

export interface DependabotRepo {
  // Speichert Snapshot nur wenn letzter > minIntervalMs ago oder kein Snapshot existiert
  maybeRecordSnapshot(fullName: string, count: number, now: Date, minIntervalMs: number): void
  getHistory(fullName: string): DependabotSnapshot[]
  pruneOld(daysToKeep: number, now: Date): void
}
```

- [ ] **Step 2: Test schreiben**

```typescript
// tests/unit/db/dependabot-repo.test.ts
import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

const MIN_30 = 30 * 60 * 1000

describe('DependabotRepo', () => {
  const cleanup: string[] = []
  afterEach(() => { cleanup.splice(0).forEach(cleanupTempDir) })

  test('getHistory returns empty for unknown repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-dep-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    expect(repos.dependabot.getHistory('alice/alpha')).toEqual([])
    repos.close()
  })

  test('maybeRecordSnapshot stores first snapshot immediately', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-dep-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const now = new Date('2026-06-20T10:00:00Z')

    repos.dependabot.maybeRecordSnapshot('alice/alpha', 3, now, MIN_30)

    const history = repos.dependabot.getHistory('alice/alpha')
    expect(history).toHaveLength(1)
    expect(history[0]?.count).toBe(3)
    repos.close()
  })

  test('maybeRecordSnapshot skips if within minInterval', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-dep-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const t0 = new Date('2026-06-20T10:00:00Z')
    const t1 = new Date('2026-06-20T10:15:00Z') // 15 min später

    repos.dependabot.maybeRecordSnapshot('alice/alpha', 3, t0, MIN_30)
    repos.dependabot.maybeRecordSnapshot('alice/alpha', 5, t1, MIN_30)

    expect(repos.dependabot.getHistory('alice/alpha')).toHaveLength(1)
    repos.close()
  })

  test('maybeRecordSnapshot records after minInterval', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-dep-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const t0 = new Date('2026-06-20T10:00:00Z')
    const t1 = new Date('2026-06-20T10:31:00Z') // 31 min später

    repos.dependabot.maybeRecordSnapshot('alice/alpha', 3, t0, MIN_30)
    repos.dependabot.maybeRecordSnapshot('alice/alpha', 5, t1, MIN_30)

    expect(repos.dependabot.getHistory('alice/alpha')).toHaveLength(2)
    repos.close()
  })

  test('pruneOld removes entries older than daysToKeep', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-dep-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const old = new Date('2025-01-01T00:00:00Z')
    const recent = new Date('2026-06-20T10:00:00Z')
    const now = new Date('2026-06-20T10:01:00Z')

    // Insert both directly (bypass interval check by using different timestamps > 30min apart)
    repos.dependabot.maybeRecordSnapshot('alice/alpha', 10, old, 0)
    repos.dependabot.maybeRecordSnapshot('alice/alpha', 5, recent, 0)
    repos.dependabot.pruneOld(183, now)

    const history = repos.dependabot.getHistory('alice/alpha')
    expect(history).toHaveLength(1)
    expect(history[0]?.count).toBe(5)
    repos.close()
  })
})
```

- [ ] **Step 3: Test ausführen (muss fehlschlagen)**

```bash
bun test tests/unit/db/dependabot-repo.test.ts
```

- [ ] **Step 4: Implementierung schreiben**

```typescript
// src/db/dependabot/sqlite-dependabot-repo.ts
import type { Database } from 'bun:sqlite'
import type { DependabotSnapshot } from '../types.ts'
import type { DependabotRepo } from './dependabot-repo.ts'

type HistoryRow = { repo_full_name: string; count: number; recorded_at: string }

export function createSqliteDependabotRepo(db: Database): DependabotRepo {
  const getLatest = db.query<{ recorded_at: string }, [string]>(
    'SELECT recorded_at FROM dependabot_history WHERE repo_full_name = ? ORDER BY recorded_at DESC LIMIT 1',
  )

  return {
    maybeRecordSnapshot(fullName, count, now, minIntervalMs) {
      const latest = getLatest.get(fullName)
      if (latest) {
        const age = now.getTime() - new Date(latest.recorded_at).getTime()
        if (age < minIntervalMs) return
      }
      db.run(
        'INSERT INTO dependabot_history (repo_full_name, count, recorded_at) VALUES (?, ?, ?)',
        [fullName, count, now.toISOString()],
      )
    },

    getHistory(fullName) {
      return db
        .query<HistoryRow, [string]>(
          'SELECT repo_full_name, count, recorded_at FROM dependabot_history WHERE repo_full_name = ? ORDER BY recorded_at ASC',
        )
        .all(fullName)
        .map((row) => ({
          repoFullName: row.repo_full_name,
          count: row.count,
          recordedAt: new Date(row.recorded_at),
        }))
    },

    pruneOld(daysToKeep, now) {
      const cutoff = new Date(now.getTime() - daysToKeep * 24 * 60 * 60 * 1000).toISOString()
      db.run('DELETE FROM dependabot_history WHERE recorded_at < ?', [cutoff])
    },
  }
}
```

- [ ] **Step 5: Tests laufen lassen**

```bash
bun test tests/unit/db/dependabot-repo.test.ts
```

Erwartete Ausgabe: 5 passing tests.

- [ ] **Step 6: Alle DB-Tests laufen lassen**

```bash
bun test tests/unit/db/
```

Erwartete Ausgabe: Alle tests passing (migrations + auth + cards + prs + dependabot).

- [ ] **Step 7: Commit**

```bash
git add src/db/dependabot/ tests/unit/db/dependabot-repo.test.ts
git commit -m "feat(db): add dependabot history repository"
```

---

## Phase 2 abgeschlossen ✓

Ergebnis:
- `src/db/types.ts` — alle Domain-Typen, readonly
- `src/db/migrations.ts` — versioniertes Schema via PRAGMA user_version
- `src/db/sqlite-repository.ts` — `createSqliteRepos(dbPath): Repos`
- 4 Repository-Interfaces + SQLite-Implementierungen
- 20+ Unit-Tests, alle gegen echte SQLite-DBs

```bash
bun test tests/unit/db/
# → alle tests passing
```

**Nächste Phase:** `2026-06-20-phase-3-app-layer.md` — GitHub Client, Services, Templates, Routes, Server
