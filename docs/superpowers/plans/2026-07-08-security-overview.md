# Security Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dependabot count badge on each card with a per-severity security overview (Critical/High/Medium/Low + SLA overdue indicators), backed by a stored `security_alerts` table, with a click-through modal and configurable global SLA thresholds.

**Architecture:** Alerts are fetched in `activity-service.ts` (existing Dependabot poll) and written to a new `security_alerts` SQLite table. Card service reads per-severity counts + SLA overdue status from that table using a pure `calculateSecurityCounts` function. A new security modal route and SLA settings route are wired into `index.ts`.

**Tech Stack:** Bun, TypeScript (strict), `bun:sqlite`, HTMX, Biome, `bun test`

## Global Constraints

- Every task: run `bun run check` (Biome) and `bun x tsc --noEmit` before committing — fix all errors
- Every task: run `bun test tests/unit` and verify 0 failures before committing
- No `Co-Authored-By: Claude` in commits
- TDD: failing test first, then implementation
- All identifiers and comments in English
- No HTML in services/repos; no business logic in templates
- `readonly` on all domain types

---

## File Map

**New files:**
- `src/db/security/security-alerts-repo.ts`
- `src/db/security/sqlite-security-alerts-repo.ts`
- `src/db/sla/sla-repo.ts`
- `src/db/sla/sqlite-sla-repo.ts`
- `src/services/security-service.ts`
- `src/routes/security-route.ts`
- `src/templates/security-modal-template.ts`
- `tests/unit/db/security-alerts-repo.test.ts`
- `tests/unit/db/sla-repo.test.ts`
- `tests/unit/services/security-service.test.ts`
- `tests/unit/templates/security-modal-template.test.ts`

**Modified files:**
- `src/db/types.ts` — add SecurityAlert, SlaSettings, SecurityCounts; later remove DependabotSnapshot, DependabotTrend
- `src/db/migrations.ts` — add v4 security_alerts table
- `src/db/repos.ts` — add security + sla; later remove dependabot
- `src/db/sqlite-repository.ts` — wire new repos; later remove dependabot
- `src/github/github-client.ts` — add ecosystem + cvssScore to GitHubDependabotAlert
- `src/services/activity-service.ts` — upsert security_alerts in syncDependabotAlerts
- `src/services/card-service.ts` — securityCounts replaces trend; remove dep snapshot calls
- `src/templates/types.ts` — replace dep fields with security fields in CardViewModel
- `src/templates/card-template.ts` — replace dep badge with security badge; remove dep imports
- `src/templates/formatters.ts` — remove depColor, depBgColor, formatDepBadgeTrend, formatDepLabel
- `src/index.ts` — wire new routes
- `tests/unit/db/migrations.test.ts` — update version + add security_alerts table check
- `tests/unit/services/card-service.test.ts` — remove dependabot snapshot test; update dep count test
- `tests/unit/templates/card-template.test.ts` — replace dep badge tests with security badge tests
- `tests/unit/templates/formatters.test.ts` — remove dep formatter test blocks
- `tests/e2e/seed-db.ts` — add security alert seeding
- `tests/e2e/dashboard.spec.ts` — add security badge + modal + SLA tests

**Deleted files:**
- `src/db/dependabot/dependabot-repo.ts`
- `src/db/dependabot/sqlite-dependabot-repo.ts`
- `src/services/dependabot-service.ts`
- `tests/unit/db/dependabot-repo.test.ts`
- `tests/unit/services/dependabot-service.test.ts`

---

## Task 1: New domain types + migration v4

**Files:**
- Modify: `src/db/types.ts`
- Modify: `src/db/migrations.ts`
- Modify: `tests/unit/db/migrations.test.ts`

**Interfaces:**
- Produces: `SecurityAlert`, `SlaSettings`, `SecurityCounts` types used by all subsequent tasks

- [ ] **Step 1: Add new types to `src/db/types.ts`**

Append after the existing `DependabotTrend` type (do NOT remove existing types yet — removals happen in Task 10):

```ts
export type SecurityAlert = {
  readonly repoFullName: string
  readonly number: number
  readonly ecosystem: string
  readonly packageName: string
  readonly title: string
  readonly severity: 'critical' | 'high' | 'medium' | 'low'
  readonly cvssScore: number | null
  readonly createdAt: Date
  readonly htmlUrl: string
}

export type SlaSettings = {
  readonly critical: number
  readonly high: number
  readonly medium: number
  readonly low: number
}

export type SecurityCounts = {
  readonly critical: number
  readonly high: number
  readonly medium: number
  readonly low: number
  readonly overdueSeverities: ReadonlySet<'critical' | 'high' | 'medium' | 'low'>
}
```

- [ ] **Step 2: Add migration v4 to `src/db/migrations.ts`**

Append a fourth entry to the `MIGRATIONS` array:

```ts
  // v4: per-repo security alert details for badge and modal
  (db) => {
    db.run(`CREATE TABLE security_alerts (
      repo_full_name TEXT NOT NULL,
      number         INTEGER NOT NULL,
      ecosystem      TEXT NOT NULL,
      package_name   TEXT NOT NULL,
      title          TEXT NOT NULL,
      severity       TEXT NOT NULL,
      cvss_score     REAL,
      created_at     TEXT NOT NULL,
      html_url       TEXT NOT NULL,
      PRIMARY KEY (repo_full_name, number)
    )`)
  },
```

- [ ] **Step 3: Update migration test**

In `tests/unit/db/migrations.test.ts`, update both assertions:

Change `expect(row?.user_version).toBe(3)` → `expect(row?.user_version).toBe(4)`

Add `expect(tables).toContain('security_alerts')` after the existing `toContain('activity_meta')` line.

- [ ] **Step 4: Run tests and typecheck**

```bash
bun test tests/unit/db/migrations.test.ts
bun x tsc --noEmit
```

Expected: all 3 migration tests pass, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/db/types.ts src/db/migrations.ts tests/unit/db/migrations.test.ts
git commit -m "feat(security): add SecurityAlert/SlaSettings/SecurityCounts types + migration v4"
```

---

## Task 2: SecurityAlertsRepo — interface, SQLite implementation, unit tests

**Files:**
- Create: `src/db/security/security-alerts-repo.ts`
- Create: `src/db/security/sqlite-security-alerts-repo.ts`
- Create: `tests/unit/db/security-alerts-repo.test.ts`

**Interfaces:**
- Produces: `SecurityAlertsRepo` with `upsertAlerts(fullName, alerts)` and `getAlerts(fullName)`
- Consumes: `SecurityAlert` from `src/db/types.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/db/security-alerts-repo.test.ts`:

```ts
import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { SecurityAlert } from '../../../src/db/types.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

const T0 = new Date('2026-06-01T10:00:00Z')

function makeAlert(overrides: Partial<SecurityAlert> = {}): SecurityAlert {
  return {
    repoFullName: 'alice/alpha',
    number: 1,
    ecosystem: 'npm',
    packageName: 'lodash',
    title: 'Prototype Pollution in lodash',
    severity: 'high',
    cvssScore: 7.4,
    createdAt: T0,
    htmlUrl: 'https://github.com/alice/alpha/security/dependabot/1',
    ...overrides,
  }
}

describe('SecurityAlertsRepo', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('getAlerts returns empty for unknown repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    expect(repos.security.getAlerts('alice/alpha')).toEqual([])
    repos.close()
  })

  test('upsertAlerts stores all fields and getAlerts retrieves them', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [makeAlert()])
    const alerts = repos.security.getAlerts('alice/alpha')

    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.ecosystem).toBe('npm')
    expect(alerts[0]?.packageName).toBe('lodash')
    expect(alerts[0]?.title).toBe('Prototype Pollution in lodash')
    expect(alerts[0]?.severity).toBe('high')
    expect(alerts[0]?.cvssScore).toBe(7.4)
    expect(alerts[0]?.createdAt.toISOString()).toBe(T0.toISOString())
    expect(alerts[0]?.htmlUrl).toContain('/security/dependabot/1')
    repos.close()
  })

  test('upsertAlerts replaces existing alerts for repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [makeAlert({ number: 1 }), makeAlert({ number: 2 })])
    repos.security.upsertAlerts('alice/alpha', [makeAlert({ number: 3 })])

    const alerts = repos.security.getAlerts('alice/alpha')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.number).toBe(3)
    repos.close()
  })

  test('upsertAlerts with empty array clears existing alerts', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [makeAlert()])
    repos.security.upsertAlerts('alice/alpha', [])

    expect(repos.security.getAlerts('alice/alpha')).toHaveLength(0)
    repos.close()
  })

  test('getAlerts sorts critical before high before medium before low', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [
      makeAlert({ number: 1, severity: 'low' }),
      makeAlert({ number: 2, severity: 'critical' }),
      makeAlert({ number: 3, severity: 'medium' }),
      makeAlert({ number: 4, severity: 'high' }),
    ])

    const alerts = repos.security.getAlerts('alice/alpha')
    expect(alerts.map((a) => a.severity)).toEqual(['critical', 'high', 'medium', 'low'])
    repos.close()
  })

  test('getAlerts within same severity orders oldest createdAt first', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const older = new Date('2026-01-01T00:00:00Z')
    const newer = new Date('2026-06-01T00:00:00Z')

    repos.security.upsertAlerts('alice/alpha', [
      makeAlert({ number: 1, severity: 'high', createdAt: newer }),
      makeAlert({ number: 2, severity: 'high', createdAt: older }),
    ])

    const alerts = repos.security.getAlerts('alice/alpha')
    expect(alerts[0]?.number).toBe(2)
    expect(alerts[1]?.number).toBe(1)
    repos.close()
  })

  test('upsertAlerts does not affect alerts for other repos', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [makeAlert({ repoFullName: 'alice/alpha' })])
    repos.security.upsertAlerts('alice/beta', [])

    expect(repos.security.getAlerts('alice/alpha')).toHaveLength(1)
    repos.close()
  })

  test('cvssScore can be null', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sec-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.security.upsertAlerts('alice/alpha', [makeAlert({ cvssScore: null })])
    const alerts = repos.security.getAlerts('alice/alpha')

    expect(alerts[0]?.cvssScore).toBeNull()
    repos.close()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/unit/db/security-alerts-repo.test.ts
```

Expected: fails with `repos.security is not a function` or similar — `security` does not exist on `Repos` yet.

- [ ] **Step 3: Create interface `src/db/security/security-alerts-repo.ts`**

```ts
import type { SecurityAlert } from '../types.ts'

export interface SecurityAlertsRepo {
  upsertAlerts(fullName: string, alerts: readonly SecurityAlert[]): void
  getAlerts(fullName: string): SecurityAlert[]
}
```

- [ ] **Step 4: Create SQLite implementation `src/db/security/sqlite-security-alerts-repo.ts`**

```ts
import type { Database } from 'bun:sqlite'
import type { SecurityAlert } from '../types.ts'
import type { SecurityAlertsRepo } from './security-alerts-repo.ts'

type AlertRow = {
  repo_full_name: string
  number: number
  ecosystem: string
  package_name: string
  title: string
  severity: string
  cvss_score: number | null
  created_at: string
  html_url: string
}

export function createSqliteSecurityAlertsRepo(db: Database): SecurityAlertsRepo {
  const insert = db.prepare(`
    INSERT INTO security_alerts
      (repo_full_name, number, ecosystem, package_name, title, severity, cvss_score, created_at, html_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  return {
    upsertAlerts(fullName, alerts) {
      db.transaction(() => {
        db.run('DELETE FROM security_alerts WHERE repo_full_name = ?', [fullName])
        for (const a of alerts) {
          insert.run(
            fullName,
            a.number,
            a.ecosystem,
            a.packageName,
            a.title,
            a.severity,
            a.cvssScore,
            a.createdAt.toISOString(),
            a.htmlUrl,
          )
        }
      })()
    },

    getAlerts(fullName) {
      return db
        .query<AlertRow, [string]>(
          `SELECT repo_full_name, number, ecosystem, package_name, title, severity, cvss_score, created_at, html_url
           FROM security_alerts
           WHERE repo_full_name = ?
           ORDER BY
             CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
             created_at ASC`,
        )
        .all(fullName)
        .map((row) => ({
          repoFullName: row.repo_full_name,
          number: row.number,
          ecosystem: row.ecosystem,
          packageName: row.package_name,
          title: row.title,
          severity: row.severity as SecurityAlert['severity'],
          cvssScore: row.cvss_score,
          createdAt: new Date(row.created_at),
          htmlUrl: row.html_url,
        }))
    },
  }
}
```

- [ ] **Step 5: Add `security` to `src/db/repos.ts`**

```ts
import type { ActivityRepo } from './activity/activity-repo.ts'
import type { AuthRepo } from './auth/auth-repo.ts'
import type { CardRepo } from './cards/card-repo.ts'
import type { DependabotRepo } from './dependabot/dependabot-repo.ts'
import type { PrRepo } from './pull-requests/pr-repo.ts'
import type { SecurityAlertsRepo } from './security/security-alerts-repo.ts'

export interface Repos {
  readonly auth: AuthRepo
  readonly cards: CardRepo
  readonly pullRequests: PrRepo
  readonly dependabot: DependabotRepo
  readonly activity: ActivityRepo
  readonly security: SecurityAlertsRepo
  close(): void
}
```

- [ ] **Step 6: Wire into `src/db/sqlite-repository.ts`**

```ts
import { Database } from 'bun:sqlite'
import { createSqliteActivityRepo } from './activity/sqlite-activity-repo.ts'
import { createSqliteAuthRepo } from './auth/sqlite-auth-repo.ts'
import { createSqliteCardRepo } from './cards/sqlite-card-repo.ts'
import { createSqliteDependabotRepo } from './dependabot/sqlite-dependabot-repo.ts'
import { runMigrations } from './migrations.ts'
import { createSqlitePrRepo } from './pull-requests/sqlite-pr-repo.ts'
import type { Repos } from './repos.ts'
import { createSqliteSecurityAlertsRepo } from './security/sqlite-security-alerts-repo.ts'

export function createSqliteRepos(dbPath: string): Repos {
  const db = new Database(dbPath, { create: true })
  db.run('PRAGMA journal_mode = WAL')
  runMigrations(db)
  return {
    auth: createSqliteAuthRepo(db),
    cards: createSqliteCardRepo(db),
    pullRequests: createSqlitePrRepo(db),
    dependabot: createSqliteDependabotRepo(db),
    activity: createSqliteActivityRepo(db),
    security: createSqliteSecurityAlertsRepo(db),
    close() {
      db.close()
    },
  }
}
```

- [ ] **Step 7: Run tests and typecheck**

```bash
bun test tests/unit/db/security-alerts-repo.test.ts
bun x tsc --noEmit
bun run check
```

Expected: all 8 security-alerts-repo tests pass, no TypeScript/Biome errors.

- [ ] **Step 8: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass (existing tests unaffected).

- [ ] **Step 9: Commit**

```bash
git add src/db/security/ src/db/repos.ts src/db/sqlite-repository.ts tests/unit/db/security-alerts-repo.test.ts
git commit -m "feat(security): add SecurityAlertsRepo with upsert/get and SQLite implementation"
```

---

## Task 3: SlaRepo — interface, SQLite implementation, unit tests

**Files:**
- Create: `src/db/sla/sla-repo.ts`
- Create: `src/db/sla/sqlite-sla-repo.ts`
- Create: `tests/unit/db/sla-repo.test.ts`

**Interfaces:**
- Produces: `SlaRepo` with `getSla()` → `SlaSettings` (defaults when unset) and `setSla(settings)`
- Consumes: `SlaSettings` from `src/db/types.ts`; reads/writes `settings` table (existing)

- [ ] **Step 1: Write failing tests**

Create `tests/unit/db/sla-repo.test.ts`:

```ts
import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

describe('SlaRepo', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('getSla returns industry-standard defaults when no settings stored', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sla-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    const sla = repos.sla.getSla()

    expect(sla.critical).toBe(7)
    expect(sla.high).toBe(30)
    expect(sla.medium).toBe(90)
    expect(sla.low).toBe(180)
    repos.close()
  })

  test('setSla + getSla roundtrips all four severities', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sla-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.sla.setSla({ critical: 3, high: 14, medium: 60, low: 90 })
    const sla = repos.sla.getSla()

    expect(sla.critical).toBe(3)
    expect(sla.high).toBe(14)
    expect(sla.medium).toBe(60)
    expect(sla.low).toBe(90)
    repos.close()
  })

  test('setSla overwrites previous values', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sla-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.sla.setSla({ critical: 1, high: 1, medium: 1, low: 1 })
    repos.sla.setSla({ critical: 14, high: 60, medium: 120, low: 365 })
    const sla = repos.sla.getSla()

    expect(sla.critical).toBe(14)
    expect(sla.high).toBe(60)
    repos.close()
  })

  test('setSla does not affect other settings keys', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-sla-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })
    repos.sla.setSla({ critical: 7, high: 30, medium: 90, low: 180 })

    expect(repos.auth.getToken()?.pat).toBe('ghp_test')
    repos.close()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/unit/db/sla-repo.test.ts
```

Expected: fails — `repos.sla` does not exist on `Repos` yet.

- [ ] **Step 3: Create interface `src/db/sla/sla-repo.ts`**

```ts
import type { SlaSettings } from '../types.ts'

export interface SlaRepo {
  getSla(): SlaSettings
  setSla(settings: SlaSettings): void
}
```

- [ ] **Step 4: Create SQLite implementation `src/db/sla/sqlite-sla-repo.ts`**

```ts
import type { Database } from 'bun:sqlite'
import type { SlaSettings } from '../types.ts'
import type { SlaRepo } from './sla-repo.ts'

const DEFAULTS: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }

export function createSqliteSlaRepo(db: Database): SlaRepo {
  const get = db.query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

  function getInt(key: string, fallback: number): number {
    const raw = get.get(key)?.value
    const parsed = raw !== undefined ? Number.parseInt(raw, 10) : Number.NaN
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return {
    getSla() {
      return {
        critical: getInt('sla_critical_days', DEFAULTS.critical),
        high: getInt('sla_high_days', DEFAULTS.high),
        medium: getInt('sla_medium_days', DEFAULTS.medium),
        low: getInt('sla_low_days', DEFAULTS.low),
      }
    },

    setSla(settings) {
      db.transaction(() => {
        upsert.run('sla_critical_days', String(settings.critical))
        upsert.run('sla_high_days', String(settings.high))
        upsert.run('sla_medium_days', String(settings.medium))
        upsert.run('sla_low_days', String(settings.low))
      })()
    },
  }
}
```

- [ ] **Step 5: Add `sla` to `src/db/repos.ts`**

```ts
import type { ActivityRepo } from './activity/activity-repo.ts'
import type { AuthRepo } from './auth/auth-repo.ts'
import type { CardRepo } from './cards/card-repo.ts'
import type { DependabotRepo } from './dependabot/dependabot-repo.ts'
import type { PrRepo } from './pull-requests/pr-repo.ts'
import type { SecurityAlertsRepo } from './security/security-alerts-repo.ts'
import type { SlaRepo } from './sla/sla-repo.ts'

export interface Repos {
  readonly auth: AuthRepo
  readonly cards: CardRepo
  readonly pullRequests: PrRepo
  readonly dependabot: DependabotRepo
  readonly activity: ActivityRepo
  readonly security: SecurityAlertsRepo
  readonly sla: SlaRepo
  close(): void
}
```

- [ ] **Step 6: Wire into `src/db/sqlite-repository.ts`**

Add import and field:

```ts
import { createSqliteSlaRepo } from './sla/sqlite-sla-repo.ts'
```

Add to the returned object:

```ts
sla: createSqliteSlaRepo(db),
```

- [ ] **Step 7: Run tests and typecheck**

```bash
bun test tests/unit/db/sla-repo.test.ts
bun x tsc --noEmit
bun run check
```

Expected: all 4 SLA repo tests pass, no errors.

- [ ] **Step 8: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/db/sla/ src/db/repos.ts src/db/sqlite-repository.ts tests/unit/db/sla-repo.test.ts
git commit -m "feat(security): add SlaRepo reading/writing SLA thresholds from settings table"
```

---

## Task 4: calculateSecurityCounts — pure service function + unit tests

**Files:**
- Create: `src/services/security-service.ts`
- Create: `tests/unit/services/security-service.test.ts`

**Interfaces:**
- Produces: `calculateSecurityCounts(alerts: SecurityAlert[], sla: SlaSettings, now: Date): SecurityCounts`
- Consumes: `SecurityAlert`, `SlaSettings`, `SecurityCounts` from `src/db/types.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/services/security-service.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import type { SecurityAlert, SlaSettings } from '../../../src/db/types.ts'
import { calculateSecurityCounts } from '../../../src/services/security-service.ts'

const DEFAULT_SLA: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }
const NOW = new Date('2026-07-08T12:00:00Z')

function makeAlert(overrides: Partial<SecurityAlert> = {}): SecurityAlert {
  return {
    repoFullName: 'alice/alpha',
    number: 1,
    ecosystem: 'npm',
    packageName: 'lodash',
    title: 'test alert',
    severity: 'high',
    cvssScore: 5.0,
    createdAt: new Date(NOW.getTime() - 10 * 86_400_000), // 10 days ago
    htmlUrl: 'https://github.com/alice/alpha/security/dependabot/1',
    ...overrides,
  }
}

describe('calculateSecurityCounts', () => {
  test('returns all-zero counts and empty overdueSeverities for empty alerts', () => {
    const counts = calculateSecurityCounts([], DEFAULT_SLA, NOW)
    expect(counts.critical).toBe(0)
    expect(counts.high).toBe(0)
    expect(counts.medium).toBe(0)
    expect(counts.low).toBe(0)
    expect(counts.overdueSeverities.size).toBe(0)
  })

  test('counts alerts by severity', () => {
    const alerts = [
      makeAlert({ number: 1, severity: 'critical' }),
      makeAlert({ number: 2, severity: 'critical' }),
      makeAlert({ number: 3, severity: 'high' }),
      makeAlert({ number: 4, severity: 'medium' }),
      makeAlert({ number: 5, severity: 'low' }),
      makeAlert({ number: 6, severity: 'low' }),
    ]
    const counts = calculateSecurityCounts(alerts, DEFAULT_SLA, NOW)
    expect(counts.critical).toBe(2)
    expect(counts.high).toBe(1)
    expect(counts.medium).toBe(1)
    expect(counts.low).toBe(2)
  })

  test('marks severity overdue when any alert exceeds SLA threshold', () => {
    // high SLA = 30 days; alert is 31 days old → overdue
    const alert = makeAlert({
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 31 * 86_400_000),
    })
    const counts = calculateSecurityCounts([alert], DEFAULT_SLA, NOW)
    expect(counts.overdueSeverities.has('high')).toBe(true)
  })

  test('does not mark overdue when alert age equals SLA exactly', () => {
    // high SLA = 30 days; alert is exactly 30 days old → NOT overdue (must be >)
    const alert = makeAlert({
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 30 * 86_400_000),
    })
    const counts = calculateSecurityCounts([alert], DEFAULT_SLA, NOW)
    expect(counts.overdueSeverities.has('high')).toBe(false)
  })

  test('marks only the exceeded severity, not all', () => {
    const alerts = [
      // critical SLA=7d, alert is 10d old → overdue
      makeAlert({ number: 1, severity: 'critical', createdAt: new Date(NOW.getTime() - 10 * 86_400_000) }),
      // high SLA=30d, alert is 10d old → NOT overdue
      makeAlert({ number: 2, severity: 'high', createdAt: new Date(NOW.getTime() - 10 * 86_400_000) }),
    ]
    const counts = calculateSecurityCounts(alerts, DEFAULT_SLA, NOW)
    expect(counts.overdueSeverities.has('critical')).toBe(true)
    expect(counts.overdueSeverities.has('high')).toBe(false)
    expect(counts.overdueSeverities.has('medium')).toBe(false)
    expect(counts.overdueSeverities.has('low')).toBe(false)
  })

  test('marks severity overdue if at least one alert in that severity exceeds SLA', () => {
    const alerts = [
      // high, 10d old — within 30d SLA
      makeAlert({ number: 1, severity: 'high', createdAt: new Date(NOW.getTime() - 10 * 86_400_000) }),
      // high, 35d old — over 30d SLA
      makeAlert({ number: 2, severity: 'high', createdAt: new Date(NOW.getTime() - 35 * 86_400_000) }),
    ]
    const counts = calculateSecurityCounts(alerts, DEFAULT_SLA, NOW)
    expect(counts.overdueSeverities.has('high')).toBe(true)
  })

  test('uses custom SLA values from provided SlaSettings', () => {
    const customSla: SlaSettings = { critical: 1, high: 1, medium: 1, low: 1 }
    // alert is 2 days old; custom SLA is 1 day → all severities overdue
    const alert = makeAlert({
      severity: 'low',
      createdAt: new Date(NOW.getTime() - 2 * 86_400_000),
    })
    const counts = calculateSecurityCounts([alert], customSla, NOW)
    expect(counts.overdueSeverities.has('low')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/unit/services/security-service.test.ts
```

Expected: fails — `calculateSecurityCounts` does not exist yet.

- [ ] **Step 3: Implement `src/services/security-service.ts`**

```ts
import type { SecurityAlert, SecurityCounts, SlaSettings } from '../db/types.ts'

export function calculateSecurityCounts(
  alerts: readonly SecurityAlert[],
  sla: SlaSettings,
  now: Date,
): SecurityCounts {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  const overdueSeverities = new Set<'critical' | 'high' | 'medium' | 'low'>()

  for (const alert of alerts) {
    counts[alert.severity]++
    const ageDays = (now.getTime() - alert.createdAt.getTime()) / 86_400_000
    if (ageDays > sla[alert.severity]) {
      overdueSeverities.add(alert.severity)
    }
  }

  return { ...counts, overdueSeverities }
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
bun test tests/unit/services/security-service.test.ts
bun x tsc --noEmit
bun run check
```

Expected: all 7 tests pass, no errors.

- [ ] **Step 5: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/security-service.ts tests/unit/services/security-service.test.ts
git commit -m "feat(security): add calculateSecurityCounts pure service function"
```

---

## Task 5: Extend GitHubClient — ecosystem + cvssScore on Dependabot alerts

**Files:**
- Modify: `src/github/github-client.ts`

**Interfaces:**
- Modifies: `GitHubDependabotAlert` — adds `ecosystem: string` and `cvssScore: number | null`

- [ ] **Step 1: Update `GitHubDependabotAlert` type in `src/github/github-client.ts`**

Replace the existing `GitHubDependabotAlert` type (lines 42-49):

```ts
export type GitHubDependabotAlert = {
  readonly number: number
  readonly ecosystem: string
  readonly packageName: string
  readonly summary: string
  readonly severity: string
  readonly cvssScore: number | null
  readonly htmlUrl: string
  readonly createdAt: string
}
```

- [ ] **Step 2: Update `getDependabotAlerts` raw type mapping in `src/github/github-client.ts`**

Replace the raw type cast and mapping inside `getDependabotAlerts` (starting at `const raw = (await res.json())`):

```ts
const raw = (await res.json()) as Array<{
  number: number
  dependency: { package: { name: string; ecosystem: string } }
  security_advisory: {
    summary: string
    severity: string
    cvss: { score: number } | null
  }
  html_url: string
  created_at: string
}>
return raw.map((a) => ({
  number: a.number,
  ecosystem: a.dependency.package.ecosystem,
  packageName: a.dependency.package.name,
  summary: a.security_advisory.summary,
  severity: a.security_advisory.severity,
  cvssScore: a.security_advisory.cvss?.score ?? null,
  htmlUrl: a.html_url,
  createdAt: a.created_at,
}))
```

- [ ] **Step 3: Typecheck and lint**

```bash
bun x tsc --noEmit
bun run check
```

Expected: no errors. The `summary` field is still there for activity-service usage.

- [ ] **Step 4: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass — the mock `getDependabotAlerts: mock(async () => [])` in card-service tests is unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/github/github-client.ts
git commit -m "feat(security): extend GitHubDependabotAlert with ecosystem and cvssScore"
```

---

## Task 6: Update activity-service — upsert security_alerts alongside activity events

**Files:**
- Modify: `src/services/activity-service.ts`

**Interfaces:**
- Consumes: `repos.security.upsertAlerts` (from Task 2)
- Produces: `security_alerts` table is populated on every Dependabot poll

- [ ] **Step 1: Update `syncDependabotAlerts` in `src/services/activity-service.ts`**

Replace the entire `syncDependabotAlerts` function (lines 206-224):

```ts
async function syncDependabotAlerts(
  fullName: string,
  repos: Repos,
  client: GitHubClient,
): Promise<void> {
  const alerts = await client.getDependabotAlerts(fullName)
  const now = new Date()

  const activityAlerts = alerts.map((a) => ({
    repoFullName: fullName,
    eventType: 'security_alert' as ActivityEventType,
    actor: '@dependabot',
    subject: `security: ${a.packageName} — ${a.summary}`,
    linkUrl: a.htmlUrl,
    occurredAt: new Date(a.createdAt),
    recordedAt: now,
    githubEventId: null,
  }))
  repos.activity.replaceSecurityAlerts(fullName, activityAlerts)

  const securityAlerts = alerts.map((a) => ({
    repoFullName: fullName,
    number: a.number,
    ecosystem: a.ecosystem,
    packageName: a.packageName,
    title: a.summary,
    severity: a.severity as 'critical' | 'high' | 'medium' | 'low',
    cvssScore: a.cvssScore,
    createdAt: new Date(a.createdAt),
    htmlUrl: a.htmlUrl,
  }))
  repos.security.upsertAlerts(fullName, securityAlerts)
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
bun x tsc --noEmit
bun run check
```

Expected: no errors.

- [ ] **Step 3: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/activity-service.ts
git commit -m "feat(security): upsert security_alerts table in Dependabot sync alongside activity events"
```

---

## Task 7: Update card-service — securityCounts replaces trend in CardData

**Files:**
- Modify: `src/services/card-service.ts`
- Modify: `tests/unit/services/card-service.test.ts`

**Interfaces:**
- Modifies: `CardData` — removes `trend: DependabotTrend`, adds `securityCounts: SecurityCounts`
- Consumes: `calculateSecurityCounts` (Task 4), `repos.security`, `repos.sla`

- [ ] **Step 1: Update `src/services/card-service.ts`**

Replace the full file content:

```ts
// src/services/card-service.ts
import type { Repos } from '../db/repos.ts'
import type { PullRequest, RefreshHint, RepoCache, SecurityCounts } from '../db/types.ts'
import type { GitHubClient, GitHubRepo } from '../github/github-client.ts'
import { calculateSecurityCounts } from './security-service.ts'

const MAX_CI_CHECKS = 3

export type CardData = {
  readonly fullName: string
  readonly cache: RepoCache
  readonly prs: ReadonlyArray<PullRequest>
  readonly securityCounts: SecurityCounts
}

export type CardService = {
  getCard(fullName: string, refreshNeeded: ReadonlySet<RefreshHint>): Promise<CardData>
  getPinned(): string[]
  getAllRepos(): Promise<GitHubRepo[]>
  togglePin(fullName: string): boolean
  reorder(fullNames: string[]): void
}

export function createCardService(repos: Repos, client: GitHubClient): CardService {
  async function fetchSelective(
    fullName: string,
    refreshNeeded: ReadonlySet<RefreshHint>,
  ): Promise<void> {
    const now = new Date()
    const existing = repos.pullRequests.getCache(fullName)

    let githubPrs: Awaited<ReturnType<typeof client.getPrs>> | null = null
    let lastCommitAt: Date | null | undefined = undefined
    try {
      ;[githubPrs, lastCommitAt] = await Promise.all([
        refreshNeeded.has('prs') ? client.getPrs(fullName) : Promise.resolve(null),
        refreshNeeded.has('commits')
          ? client.getLastCommitDate(fullName)
          : Promise.resolve(undefined),
      ])
    } catch (err) {
      if (!existing) throw err
      return
    }

    if (githubPrs !== null && refreshNeeded.has('prs')) {
      const prsWithCi: PullRequest[] = await Promise.all(
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
      repos.activity.upsertMeta(fullName, { prsCachedAt: now })
    }

    const depCount = repos.activity.getDependabotCount(fullName)
    const commitAt = lastCommitAt !== undefined ? lastCommitAt : (existing?.lastCommitAt ?? null)
    const prTotal = githubPrs !== null ? githubPrs.length : (existing?.prTotal ?? 0)

    repos.pullRequests.upsertCache(fullName, {
      lastCommitAt: commitAt,
      prTotal,
      dependabotCount: depCount,
    })
  }

  async function getCard(
    fullName: string,
    refreshNeeded: ReadonlySet<RefreshHint>,
  ): Promise<CardData> {
    const cached = repos.pullRequests.getCache(fullName)
    const needsFetch = !cached || refreshNeeded.size > 0

    if (needsFetch) await fetchSelective(fullName, refreshNeeded)

    const cache = repos.pullRequests.getCache(fullName)
    if (!cache) throw new Error(`Cache missing for ${fullName} after fetch`)

    const depCount = repos.activity.getDependabotCount(fullName)
    const cacheWithDep: RepoCache = { ...cache, dependabotCount: depCount }

    const prs = repos.pullRequests.getPrs(fullName)
    const alerts = repos.security.getAlerts(fullName)
    const sla = repos.sla.getSla()
    const securityCounts = calculateSecurityCounts(alerts, sla, new Date())

    return { fullName, cache: cacheWithDep, prs, securityCounts }
  }

  return {
    getCard,

    getPinned() {
      return repos.cards.getPinned().map((p) => p.fullName)
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

- [ ] **Step 2: Update `tests/unit/services/card-service.test.ts` — remove dependabot snapshot test, keep dependabotCount test**

Find and remove the entire test block `'getCard records a dependabot snapshot using count from repos.activity'` (lines 130-161) — this tested `repos.dependabot.getHistory` which is being removed.

The test `'getCard reflects updated dependabot count from activity events'` (the one with `expect(data.cache.dependabotCount).toBe(2)`) stays — `dependabotCount` in cache is still populated from activity events. Verify this test still passes.

- [ ] **Step 3: Typecheck and lint**

```bash
bun x tsc --noEmit
bun run check
```

Expected: no errors.

- [ ] **Step 4: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass. (card-template.test.ts will fail because it still uses `trend` in `emptyCardData` — fix that in Task 8.)

If card-template.test.ts fails, that is expected and will be fixed in Task 8. The suite may show failures there — proceed if only card-template.test.ts fails.

- [ ] **Step 5: Commit**

```bash
git add src/services/card-service.ts tests/unit/services/card-service.test.ts
git commit -m "feat(security): replace DependabotTrend with SecurityCounts in CardData"
```

---

## Task 8: Update CardViewModel + card-template — replace dep badge with security badge

**Files:**
- Modify: `src/templates/types.ts`
- Modify: `src/templates/card-template.ts`
- Modify: `tests/unit/templates/card-template.test.ts`

**Interfaces:**
- Removes from `CardViewModel`: `securityUrl`, `depDisplay`, `depColor`, `depBg`, `depLabel`, `depBadgeTrend`, `hasDepBadgeTrend`
- Adds to `CardViewModel`: `secCritical`, `secHigh`, `secMedium`, `secLow`, `secCriticalOverdue`, `secHighOverdue`, `secMediumOverdue`, `secLowOverdue`, `secScopeAvailable`, `secHasAlerts`

- [ ] **Step 1: Update `CardViewModel` in `src/templates/types.ts`**

Replace the `CardViewModel` type:

```ts
export type CardViewModel = {
  readonly fullName: string
  readonly owner: string
  readonly name: string
  readonly repoUrl: string
  readonly lastCommit: string
  readonly ciDotColor: string
  readonly ciDotLabel: string
  readonly showCiDot: boolean
  readonly secCritical: number
  readonly secHigh: number
  readonly secMedium: number
  readonly secLow: number
  readonly secCriticalOverdue: boolean
  readonly secHighOverdue: boolean
  readonly secMediumOverdue: boolean
  readonly secLowOverdue: boolean
  readonly secScopeAvailable: boolean
  readonly secHasAlerts: boolean
  readonly activities: readonly ActivityItemViewModel[]
  readonly hasActivities: boolean
  readonly activityMore: number
  readonly hasActivityMore: boolean
  readonly prs: ReadonlyArray<PrRowViewModel>
  readonly hasPrs: boolean
  readonly noPrs: boolean
  readonly prTotal: number
  readonly prMore: number
  readonly hasMore: boolean
  readonly prMoreLabel: string
  readonly loadingId: string
  readonly borderStyle: string
}
```

- [ ] **Step 2: Update `toCardViewModel` in `src/templates/card-template.ts`**

Replace the import line and `toCardViewModel` function. First, update imports at the top — remove dep-related imports, keep the rest:

```ts
import type { Activity, CiStatus } from '../db/types.ts'
import type { CardData } from '../services/card-service.ts'
import {
  aggregateCiStatus,
  ciColor,
  ciLabel,
  escapeHtml,
  formatRelative,
  freshAgeStyle,
} from './formatters.ts'
import type { ActivityItemViewModel, CardViewModel, PrRowViewModel } from './types.ts'
```

Replace `toCardViewModel`:

```ts
export function toCardViewModel(data: CardData, activities: readonly Activity[]): CardViewModel {
  const { fullName, cache, prs, securityCounts } = data
  const [owner = '', name = ''] = fullName.split('/')
  const now = new Date()

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
    highlightStyle: freshAgeStyle(pr.createdAt, now),
  }))

  const displayActivities = activities.slice(0, MAX_ACTIVITIES_ON_CARD)
  const activityMore = Math.max(0, activities.length - MAX_ACTIVITIES_ON_CARD)

  return {
    fullName,
    owner,
    name,
    repoUrl: `https://github.com/${fullName}`,
    lastCommit: formatRelative(cache.lastCommitAt),
    ciDotColor: overallCi ? ciColor(overallCi) : 'transparent',
    ciDotLabel: overallCi ? ciLabel(overallCi) : '',
    showCiDot: overallCi !== null,
    secCritical: securityCounts.critical,
    secHigh: securityCounts.high,
    secMedium: securityCounts.medium,
    secLow: securityCounts.low,
    secCriticalOverdue: securityCounts.overdueSeverities.has('critical'),
    secHighOverdue: securityCounts.overdueSeverities.has('high'),
    secMediumOverdue: securityCounts.overdueSeverities.has('medium'),
    secLowOverdue: securityCounts.overdueSeverities.has('low'),
    secScopeAvailable: cache.dependabotCount !== null,
    secHasAlerts:
      securityCounts.critical + securityCounts.high + securityCounts.medium + securityCounts.low >
      0,
    activities: displayActivities.map((a) => toActivityItemViewModel(a, now)),
    hasActivities: displayActivities.length > 0,
    activityMore,
    hasActivityMore: activityMore > 0,
    prs: prRows,
    hasPrs: prRows.length > 0,
    noPrs: prRows.length === 0,
    prTotal: cache.prTotal,
    prMore,
    hasMore: prMore > 0,
    prMoreLabel: prMore === 1 ? '+ 1 more PR' : `+ ${prMore} more PRs`,
    loadingId: `ld-${fullName.replace(/[^a-z0-9]/gi, '-')}`,
    borderStyle: buildBorderStyle(cache.lastCommitAt),
  }
}
```

- [ ] **Step 3: Update `renderCard` security badge HTML in `src/templates/card-template.ts`**

Replace the old badge `<a href="${vm.securityUrl}" ...>` section. The badge lives in the meta row. Replace the entire meta row `<div style="display:flex;...">` block:

```ts
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:11px;flex-wrap:wrap">
    <span style="color:#8b949e">⏱ ${vm.lastCommit}</span>
    ${renderSecurityBadge(vm, safeOwner, safeName)}
    <button hx-get="/api/settings/sla" hx-target="#modal" hx-swap="innerHTML"
            style="background:transparent;border:none;cursor:pointer;color:#6e7681;padding:0;font-size:11px"
            title="Configure security SLA thresholds">⚙</button>
  </div>
```

Add the helper function `renderSecurityBadge` before `renderCard`:

```ts
function renderSecurityBadge(vm: CardViewModel, safeOwner: string, safeName: string): string {
  if (!vm.secScopeAvailable) {
    return `<span style="color:#6e7681">🔒 —</span>`
  }
  if (!vm.secHasAlerts) {
    return `<span style="color:#3fb950">🔒 ✓</span>`
  }
  const od = (flag: boolean) =>
    flag ? `<span style="color:#f85149;font-weight:700"> (!)</span>` : ''
  return `<button
    hx-get="/api/security/${safeOwner}/${safeName}"
    hx-target="#modal" hx-swap="innerHTML"
    style="display:inline-flex;align-items:center;gap:3px;background:none;border:none;cursor:pointer;padding:0;font-family:inherit;font-size:11px;color:inherit"
    title="View security alerts">
    🔒
    <span style="color:#f85149">Critical&nbsp;${vm.secCritical}${od(vm.secCriticalOverdue)}</span>
    <span style="color:#8b949e">&nbsp;·&nbsp;</span>
    <span style="color:#d29922">High&nbsp;${vm.secHigh}${od(vm.secHighOverdue)}</span>
    <span style="color:#8b949e">&nbsp;·&nbsp;</span>
    <span style="color:#d29922">Medium&nbsp;${vm.secMedium}${od(vm.secMediumOverdue)}</span>
    <span style="color:#8b949e">&nbsp;·&nbsp;</span>
    <span style="color:#6e7681">Low&nbsp;${vm.secLow}${od(vm.secLowOverdue)}</span>
  </button>`
}
```

- [ ] **Step 4: Update `tests/unit/templates/card-template.test.ts`**

Replace the `emptyCardData` helper (remove `trend`, add `securityCounts`):

```ts
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
  securityCounts: {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    overdueSeverities: new Set(),
  },
})
```

Remove all tests in the `toCardViewModel` describe block that reference `dep*` fields:
- `'depDisplay shows checkmark when dependabotCount is 0'`
- `'depDisplay shows exact number below 100'`
- `'depDisplay shows "99+" when dependabotCount is 100'`
- `'depDisplay shows "99+" when dependabotCount exceeds 100'`
- `'depLabel shows "99+ open Dependabot alerts" when dependabotCount is >= 100'`
- `'depBg is green for 0 dependabot alerts'`
- `'hasDepBadgeTrend is false when trend is all null'`
- `'depBadgeTrend propagates week to month and 6-month'`
- `'depLabel propagates week to month and 6-month in tooltip'`

Remove the test in `renderCard` block:
- `'shows security badge with "0" and green tooltip when dependabotCount is null (treated as 0)'`

Add new security badge tests inside the `toCardViewModel` describe block:

```ts
  test('secHasAlerts is false when all severity counts are 0', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'), [])
    expect(vm.secHasAlerts).toBe(false)
    expect(vm.secCritical).toBe(0)
    expect(vm.secHigh).toBe(0)
    expect(vm.secMedium).toBe(0)
    expect(vm.secLow).toBe(0)
  })

  test('secHasAlerts is true when any severity count > 0', () => {
    const data: CardData = {
      ...emptyCardData('alice/alpha'),
      securityCounts: {
        critical: 0,
        high: 3,
        medium: 0,
        low: 0,
        overdueSeverities: new Set(),
      },
    }
    const vm = toCardViewModel(data, [])
    expect(vm.secHasAlerts).toBe(true)
    expect(vm.secHigh).toBe(3)
  })

  test('secScopeAvailable is false when dependabotCount is null', () => {
    const data: CardData = {
      ...emptyCardData('alice/alpha'),
      cache: { ...emptyCardData('alice/alpha').cache, dependabotCount: null },
    }
    const vm = toCardViewModel(data, [])
    expect(vm.secScopeAvailable).toBe(false)
  })

  test('secScopeAvailable is true when dependabotCount is 0', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'), [])
    expect(vm.secScopeAvailable).toBe(true)
  })

  test('secCriticalOverdue is true when critical is in overdueSeverities', () => {
    const data: CardData = {
      ...emptyCardData('alice/alpha'),
      securityCounts: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        overdueSeverities: new Set(['critical'] as const),
      },
    }
    const vm = toCardViewModel(data, [])
    expect(vm.secCriticalOverdue).toBe(true)
    expect(vm.secHighOverdue).toBe(false)
  })
```

Add new security badge rendering tests inside `renderCard` describe block:

```ts
  test('shows green checkmark badge when secScopeAvailable and no alerts', () => {
    const html = renderCard(toCardViewModel(emptyCardData('alice/no-alerts'), []))
    expect(html).toContain('🔒 ✓')
  })

  test('shows dash badge when security scope not available', () => {
    const data: CardData = {
      ...emptyCardData('alice/no-scope'),
      cache: { ...emptyCardData('alice/no-scope').cache, dependabotCount: null },
    }
    const html = renderCard(toCardViewModel(data, []))
    expect(html).toContain('🔒 —')
  })

  test('shows HTMX security badge button when alerts present', () => {
    const data: CardData = {
      ...emptyCardData('alice/with-alerts'),
      securityCounts: {
        critical: 2,
        high: 0,
        medium: 0,
        low: 0,
        overdueSeverities: new Set(),
      },
    }
    const html = renderCard(toCardViewModel(data, []))
    expect(html).toContain('hx-get="/api/security/alice/with-alerts"')
    expect(html).toContain('Critical')
    expect(html).toContain('2')
  })

  test('shows overdue indicator (!) when severity is overdue', () => {
    const data: CardData = {
      ...emptyCardData('alice/overdue'),
      securityCounts: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        overdueSeverities: new Set(['critical'] as const),
      },
    }
    const html = renderCard(toCardViewModel(data, []))
    expect(html).toContain('(!)')
  })

  test('gear icon links to SLA settings', () => {
    const html = renderCard(toCardViewModel(emptyCardData('alice/alpha'), []))
    expect(html).toContain('hx-get="/api/settings/sla"')
  })
```

- [ ] **Step 5: Run tests and typecheck**

```bash
bun test tests/unit/templates/card-template.test.ts
bun x tsc --noEmit
bun run check
```

Expected: all card-template tests pass (new security tests green, old dep tests removed), no TypeScript/Biome errors.

- [ ] **Step 6: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/templates/types.ts src/templates/card-template.ts tests/unit/templates/card-template.test.ts
git commit -m "feat(security): replace Dependabot badge with per-severity security badge in card template"
```

---

## Task 9: Delete all obsolete Dependabot trend code

**Files:**
- Delete: `src/db/dependabot/dependabot-repo.ts`
- Delete: `src/db/dependabot/sqlite-dependabot-repo.ts`
- Delete: `src/services/dependabot-service.ts`
- Delete: `tests/unit/db/dependabot-repo.test.ts`
- Delete: `tests/unit/services/dependabot-service.test.ts`
- Modify: `src/db/types.ts` — remove DependabotSnapshot, DependabotTrend
- Modify: `src/db/repos.ts` — remove dependabot field
- Modify: `src/db/sqlite-repository.ts` — remove dependabot import + field
- Modify: `src/templates/formatters.ts` — remove depColor, depBgColor, formatDepBadgeTrend, formatDepLabel, DependabotTrend import
- Modify: `tests/unit/templates/formatters.test.ts` — remove dep formatter tests

- [ ] **Step 1: Delete obsolete source files**

```bash
rm src/db/dependabot/dependabot-repo.ts
rm src/db/dependabot/sqlite-dependabot-repo.ts
rm src/services/dependabot-service.ts
rm tests/unit/db/dependabot-repo.test.ts
rm tests/unit/services/dependabot-service.test.ts
```

- [ ] **Step 2: Remove `DependabotSnapshot` and `DependabotTrend` from `src/db/types.ts`**

Delete these two types entirely:

```ts
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

- [ ] **Step 3: Update `src/db/repos.ts` — remove dependabot**

```ts
import type { ActivityRepo } from './activity/activity-repo.ts'
import type { AuthRepo } from './auth/auth-repo.ts'
import type { CardRepo } from './cards/card-repo.ts'
import type { PrRepo } from './pull-requests/pr-repo.ts'
import type { SecurityAlertsRepo } from './security/security-alerts-repo.ts'
import type { SlaRepo } from './sla/sla-repo.ts'

export interface Repos {
  readonly auth: AuthRepo
  readonly cards: CardRepo
  readonly pullRequests: PrRepo
  readonly activity: ActivityRepo
  readonly security: SecurityAlertsRepo
  readonly sla: SlaRepo
  close(): void
}
```

- [ ] **Step 4: Update `src/db/sqlite-repository.ts` — remove dependabot**

```ts
import { Database } from 'bun:sqlite'
import { createSqliteActivityRepo } from './activity/sqlite-activity-repo.ts'
import { createSqliteAuthRepo } from './auth/sqlite-auth-repo.ts'
import { createSqliteCardRepo } from './cards/sqlite-card-repo.ts'
import { runMigrations } from './migrations.ts'
import { createSqlitePrRepo } from './pull-requests/sqlite-pr-repo.ts'
import type { Repos } from './repos.ts'
import { createSqliteSecurityAlertsRepo } from './security/sqlite-security-alerts-repo.ts'
import { createSqliteSlaRepo } from './sla/sqlite-sla-repo.ts'

export function createSqliteRepos(dbPath: string): Repos {
  const db = new Database(dbPath, { create: true })
  db.run('PRAGMA journal_mode = WAL')
  runMigrations(db)
  return {
    auth: createSqliteAuthRepo(db),
    cards: createSqliteCardRepo(db),
    pullRequests: createSqlitePrRepo(db),
    activity: createSqliteActivityRepo(db),
    security: createSqliteSecurityAlertsRepo(db),
    sla: createSqliteSlaRepo(db),
    close() {
      db.close()
    },
  }
}
```

- [ ] **Step 5: Update `src/templates/formatters.ts` — remove dep formatters**

Remove the import of `DependabotTrend` from line 1:

```ts
import type { CiStatus } from '../db/types.ts'
```

Delete these four functions entirely:
- `depColor`
- `depBgColor`
- `formatDepBadgeTrend`
- `formatDepLabel`

- [ ] **Step 6: Update `tests/unit/templates/formatters.test.ts` — remove dep formatter tests**

Remove the imports of `depBgColor`, `depColor`, `formatDepBadgeTrend`, `formatDepLabel` from the import line.

Delete the three entire describe blocks:
- `describe('formatDepBadgeTrend', ...)`
- `describe('depBgColor', ...)`
- `describe('formatDepLabel', ...)`

And delete any standalone `depColor` test if present.

- [ ] **Step 7: Typecheck, lint, test**

```bash
bun x tsc --noEmit
bun run check
bun test tests/unit
```

Expected: no TypeScript errors, no Biome errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(security): delete obsolete Dependabot trend code, repos, and tests"
```

---

## Task 10: Security modal — route, template, unit tests

**Files:**
- Create: `src/templates/security-modal-template.ts`
- Create: `src/routes/security-route.ts`
- Create: `tests/unit/templates/security-modal-template.test.ts`

**Interfaces:**
- Consumes: `repos.security.getAlerts`, `repos.sla.getSla`, `SecurityAlert`, `SlaSettings`
- Produces: `GET /api/security/:owner/:repo` → HTML modal with sorted alert table

- [ ] **Step 1: Write failing template tests**

Create `tests/unit/templates/security-modal-template.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import type { SecurityAlert, SlaSettings } from '../../../src/db/types.ts'
import {
  renderSecurityModal,
  toSecurityModalViewModel,
} from '../../../src/templates/security-modal-template.ts'

const DEFAULT_SLA: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }
const NOW = new Date('2026-07-08T12:00:00Z')

function makeAlert(overrides: Partial<SecurityAlert> = {}): SecurityAlert {
  return {
    repoFullName: 'alice/alpha',
    number: 1,
    ecosystem: 'npm',
    packageName: 'lodash',
    title: 'Prototype Pollution',
    severity: 'high',
    cvssScore: 7.4,
    createdAt: new Date(NOW.getTime() - 10 * 86_400_000),
    htmlUrl: 'https://github.com/alice/alpha/security/dependabot/1',
    ...overrides,
  }
}

describe('toSecurityModalViewModel', () => {
  test('hasAlerts is false for empty alerts', () => {
    const vm = toSecurityModalViewModel('alice/alpha', [], DEFAULT_SLA, NOW)
    expect(vm.hasAlerts).toBe(false)
    expect(vm.rows).toHaveLength(0)
  })

  test('hasAlerts is true when alerts present', () => {
    const vm = toSecurityModalViewModel('alice/alpha', [makeAlert()], DEFAULT_SLA, NOW)
    expect(vm.hasAlerts).toBe(true)
  })

  test('row ageDays is floored days since createdAt', () => {
    const alert = makeAlert({ createdAt: new Date(NOW.getTime() - 10 * 86_400_000) })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    expect(vm.rows[0]?.ageDays).toBe(10)
  })

  test('overdueBy is null when alert within SLA', () => {
    // high SLA = 30 days; alert is 10 days old
    const alert = makeAlert({ severity: 'high', createdAt: new Date(NOW.getTime() - 10 * 86_400_000) })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    expect(vm.rows[0]?.overdueBy).toBeNull()
  })

  test('overdueBy is floored days over SLA when alert exceeds SLA', () => {
    // high SLA = 30 days; alert is 43 days old → 13 days over
    const alert = makeAlert({ severity: 'high', createdAt: new Date(NOW.getTime() - 43 * 86_400_000) })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    expect(vm.rows[0]?.overdueBy).toBe(13)
  })

  test('sorts critical before high before medium before low', () => {
    const alerts = [
      makeAlert({ number: 1, severity: 'low' }),
      makeAlert({ number: 2, severity: 'critical' }),
      makeAlert({ number: 3, severity: 'medium' }),
      makeAlert({ number: 4, severity: 'high' }),
    ]
    const vm = toSecurityModalViewModel('alice/alpha', alerts, DEFAULT_SLA, NOW)
    expect(vm.rows.map((r) => r.severity)).toEqual(['critical', 'high', 'medium', 'low'])
  })

  test('within same severity, overdue alerts sort before within-SLA alerts', () => {
    const withinSla = makeAlert({
      number: 1,
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 10 * 86_400_000), // 10 days, within 30d SLA
    })
    const overdue = makeAlert({
      number: 2,
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 35 * 86_400_000), // 35 days, over 30d SLA
    })
    const vm = toSecurityModalViewModel('alice/alpha', [withinSla, overdue], DEFAULT_SLA, NOW)
    expect(vm.rows[0]?.number).toBe(2) // overdue first
    expect(vm.rows[1]?.number).toBe(1)
  })
})

describe('renderSecurityModal', () => {
  test('shows "No open security alerts" when no alerts', () => {
    const vm = toSecurityModalViewModel('alice/alpha', [], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('No open security alerts')
  })

  test('renders repo name in modal heading', () => {
    const vm = toSecurityModalViewModel('alice/alpha', [makeAlert()], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('alice/alpha')
  })

  test('renders alert row with htmlUrl as link', () => {
    const alert = makeAlert({ htmlUrl: 'https://github.com/alice/alpha/security/dependabot/42' })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('https://github.com/alice/alpha/security/dependabot/42')
  })

  test('renders overdue indicator for overdue alerts', () => {
    const alert = makeAlert({
      severity: 'high',
      createdAt: new Date(NOW.getTime() - 43 * 86_400_000),
    })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('over SLA')
  })

  test('renders CVSS score when present', () => {
    const alert = makeAlert({ cvssScore: 9.8 })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('9.8')
  })

  test('renders dash for null CVSS score', () => {
    const alert = makeAlert({ cvssScore: null })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).toContain('—')
  })

  test('escapes HTML in alert title', () => {
    const alert = makeAlert({ title: '<script>alert(1)</script>' })
    const vm = toSecurityModalViewModel('alice/alpha', [alert], DEFAULT_SLA, NOW)
    const html = renderSecurityModal(vm)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/unit/templates/security-modal-template.test.ts
```

Expected: fails — module does not exist yet.

- [ ] **Step 3: Create `src/templates/security-modal-template.ts`**

```ts
import type { SecurityAlert, SlaSettings } from '../db/types.ts'
import { escapeHtml } from './formatters.ts'

export type SecurityAlertRowViewModel = {
  readonly number: number
  readonly ecosystem: string
  readonly title: string
  readonly severity: 'critical' | 'high' | 'medium' | 'low'
  readonly cvssScore: number | null
  readonly ageDays: number
  readonly overdueBy: number | null
  readonly htmlUrl: string
}

export type SecurityModalViewModel = {
  readonly fullName: string
  readonly rows: readonly SecurityAlertRowViewModel[]
  readonly hasAlerts: boolean
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#f85149',
  high: '#d29922',
  medium: '#d29922',
  low: '#8b949e',
}

export function toSecurityModalViewModel(
  fullName: string,
  alerts: readonly SecurityAlert[],
  sla: SlaSettings,
  now: Date,
): SecurityModalViewModel {
  const rows: SecurityAlertRowViewModel[] = alerts.map((a) => {
    const ageDays = (now.getTime() - a.createdAt.getTime()) / 86_400_000
    const slaDays = sla[a.severity]
    const overdueBy = ageDays > slaDays ? Math.floor(ageDays - slaDays) : null
    return {
      number: a.number,
      ecosystem: a.ecosystem,
      title: a.title,
      severity: a.severity,
      cvssScore: a.cvssScore,
      ageDays: Math.floor(ageDays),
      overdueBy,
      htmlUrl: a.htmlUrl,
    }
  })

  const sorted = [...rows].sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    if (sevDiff !== 0) return sevDiff
    const aOverdue = a.overdueBy !== null
    const bOverdue = b.overdueBy !== null
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
    return a.ageDays - b.ageDays
  })

  return { fullName, rows: sorted, hasAlerts: sorted.length > 0 }
}

export function renderSecurityModal(vm: SecurityModalViewModel): string {
  const safeFullName = escapeHtml(vm.fullName)
  return `
<div style="padding:20px;min-width:600px">
  <h3 style="margin:0 0 16px;font-size:15px;font-weight:600;color:#e6edf3">
    🔒 Security Alerts — ${safeFullName}
  </h3>
  ${
    !vm.hasAlerts
      ? `<p style="color:#8b949e;font-size:13px">No open security alerts.</p>`
      : `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="border-bottom:1px solid #30363d;color:#6e7681;text-align:left">
          <th style="padding:6px 8px;font-weight:600">Ecosystem</th>
          <th style="padding:6px 8px;font-weight:600">Title</th>
          <th style="padding:6px 8px;font-weight:600">Severity</th>
          <th style="padding:6px 8px;font-weight:600">Score</th>
          <th style="padding:6px 8px;font-weight:600">Age</th>
        </tr>
      </thead>
      <tbody>
        ${vm.rows.map(renderAlertRow).join('')}
      </tbody>
    </table>
  </div>`
  }
</div>`
}

function renderAlertRow(row: SecurityAlertRowViewModel): string {
  const rowBg = row.overdueBy !== null ? 'background:rgba(248,81,73,0.08)' : ''
  const severityColor = SEVERITY_COLOR[row.severity] ?? '#8b949e'
  const severityLabel = row.severity.charAt(0).toUpperCase() + row.severity.slice(1)
  const ageText =
    row.overdueBy !== null
      ? `${row.ageDays}d · <span style="color:#f85149;font-weight:600">${row.overdueBy}d over SLA</span>`
      : `${row.ageDays}d`

  return `<tr style="border-bottom:1px solid #21262d;${rowBg};cursor:pointer"
    onclick="window.open('${escapeHtml(row.htmlUrl)}','_blank','noopener,noreferrer')">
    <td style="padding:7px 8px;color:#8b949e">${escapeHtml(row.ecosystem)}</td>
    <td style="padding:7px 8px;color:#c9d1d9;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(row.title)}</td>
    <td style="padding:7px 8px"><span style="color:${severityColor};font-weight:600">${severityLabel}</span></td>
    <td style="padding:7px 8px;color:#8b949e;font-family:monospace">${row.cvssScore !== null ? row.cvssScore.toFixed(1) : '—'}</td>
    <td style="padding:7px 8px;color:#8b949e;white-space:nowrap">${ageText}</td>
  </tr>`
}
```

- [ ] **Step 4: Create `src/routes/security-route.ts`**

```ts
import type { SecurityAlertsRepo } from '../db/security/security-alerts-repo.ts'
import type { SlaRepo } from '../db/sla/sla-repo.ts'
import { renderSecurityModal, toSecurityModalViewModel } from '../templates/security-modal-template.ts'
import { html } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

export function createSecurityRoutes(
  securityRepo: SecurityAlertsRepo,
  slaRepo: SlaRepo,
): RouteHandler[] {
  return [
    {
      match: (url, method) =>
        method === 'GET' && /^\/api\/security\/[^/]+\/[^/]+$/.test(url.pathname),
      handle(_req, url) {
        const [, , , owner, repo] = url.pathname.split('/')
        const fullName = `${owner}/${repo}`
        const alerts = securityRepo.getAlerts(fullName)
        const sla = slaRepo.getSla()
        const now = new Date()
        const vm = toSecurityModalViewModel(fullName, alerts, sla, now)
        return html(renderSecurityModal(vm))
      },
    },
  ]
}
```

- [ ] **Step 5: Run tests and typecheck**

```bash
bun test tests/unit/templates/security-modal-template.test.ts
bun x tsc --noEmit
bun run check
```

Expected: all 13 tests pass, no errors.

- [ ] **Step 6: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/templates/security-modal-template.ts src/routes/security-route.ts tests/unit/templates/security-modal-template.test.ts
git commit -m "feat(security): add security modal template and route"
```

---

## Task 11: SLA settings — route, template, unit tests

**Files:**
- Modify: `src/templates/security-modal-template.ts` — add `renderSlaSettingsModal`
- Modify: `src/routes/security-route.ts` — add GET/POST `/api/settings/sla`
- Modify: `tests/unit/templates/security-modal-template.test.ts` — add SLA form tests

**Interfaces:**
- Produces: `GET /api/settings/sla` → HTML form; `POST /api/settings/sla` → saves + `HX-Trigger: cardsChanged`

- [ ] **Step 1: Add SLA settings modal tests to `tests/unit/templates/security-modal-template.test.ts`**

Add at the end of the file:

```ts
describe('renderSlaSettingsModal', () => {
  test('renders input for each severity with current values', () => {
    const sla: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }
    const html = renderSlaSettingsModal(sla)
    expect(html).toContain('value="7"')
    expect(html).toContain('value="30"')
    expect(html).toContain('value="90"')
    expect(html).toContain('value="180"')
  })

  test('renders industry standard hint for each severity', () => {
    const sla: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }
    const html = renderSlaSettingsModal(sla)
    expect(html).toContain('industry standard')
  })

  test('form posts to /api/settings/sla', () => {
    const html = renderSlaSettingsModal({ critical: 7, high: 30, medium: 90, low: 180 })
    expect(html).toContain('hx-post="/api/settings/sla"')
  })

  test('renders custom values not equal to defaults', () => {
    const sla: SlaSettings = { critical: 3, high: 14, medium: 60, low: 90 }
    const html = renderSlaSettingsModal(sla)
    expect(html).toContain('value="3"')
    expect(html).toContain('value="14"')
  })
})
```

Update the import line at the top of the test file to also import `renderSlaSettingsModal`:

```ts
import {
  renderSecurityModal,
  renderSlaSettingsModal,
  toSecurityModalViewModel,
} from '../../../src/templates/security-modal-template.ts'
```

Also add `SlaSettings` to the types import:

```ts
import type { SecurityAlert, SlaSettings } from '../../../src/db/types.ts'
```

- [ ] **Step 2: Run tests to verify new SLA tests fail**

```bash
bun test tests/unit/templates/security-modal-template.test.ts
```

Expected: new `renderSlaSettingsModal` tests fail — function not exported yet.

- [ ] **Step 3: Add `renderSlaSettingsModal` to `src/templates/security-modal-template.ts`**

Add this function at the end of the file:

```ts
const INDUSTRY_STANDARD: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }

export function renderSlaSettingsModal(current: SlaSettings): string {
  const row = (
    label: string,
    key: keyof SlaSettings,
    inputName: string,
  ) => `
  <tr>
    <td style="padding:8px 0;color:#c9d1d9;font-size:13px;width:80px">${label}</td>
    <td style="padding:8px 0">
      <input type="number" name="${inputName}" value="${current[key]}" min="1" max="365"
             style="width:70px;background:#0d1117;border:1px solid #30363d;border-radius:6px;
                    color:#e6edf3;padding:4px 8px;font-size:13px;font-family:inherit"/>
    </td>
    <td style="padding:8px 0 8px 12px;color:#484f58;font-size:11px">
      days &nbsp;·&nbsp; industry standard: ${INDUSTRY_STANDARD[key]} days
    </td>
  </tr>`

  return `
<div style="padding:20px">
  <h3 style="margin:0 0 16px;font-size:15px;font-weight:600;color:#e6edf3">Security SLA Settings</h3>
  <form hx-post="/api/settings/sla" hx-target="#modal" hx-swap="innerHTML">
    <table style="border-collapse:collapse">
      ${row('Critical', 'critical', 'sla_critical_days')}
      ${row('High', 'high', 'sla_high_days')}
      ${row('Medium', 'medium', 'sla_medium_days')}
      ${row('Low', 'low', 'sla_low_days')}
    </table>
    <div style="margin-top:16px">
      <button type="submit"
              style="background:#238636;border:1px solid rgba(240,246,252,0.1);border-radius:6px;
                     color:#fff;padding:5px 16px;font-size:13px;cursor:pointer;font-family:inherit">
        Save
      </button>
    </div>
  </form>
</div>`
}
```

- [ ] **Step 4: Add SLA settings routes to `src/routes/security-route.ts`**

Add two new route handlers to the returned array in `createSecurityRoutes`:

```ts
    {
      match: (url, method) => url.pathname === '/api/settings/sla' && method === 'GET',
      handle() {
        const sla = slaRepo.getSla()
        return html(renderSlaSettingsModal(sla))
      },
    },
    {
      match: (url, method) => url.pathname === '/api/settings/sla' && method === 'POST',
      async handle(req) {
        const body = await req.formData()
        const parse = (key: string, fallback: number): number => {
          const val = Number.parseInt(body.get(key)?.toString() ?? '', 10)
          return Number.isFinite(val) && val > 0 ? val : fallback
        }
        const current = slaRepo.getSla()
        slaRepo.setSla({
          critical: parse('sla_critical_days', current.critical),
          high: parse('sla_high_days', current.high),
          medium: parse('sla_medium_days', current.medium),
          low: parse('sla_low_days', current.low),
        })
        return new Response('', {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'HX-Trigger': 'cardsChanged',
          },
        })
      },
    },
```

Also add the import at the top of the route file:

```ts
import { renderSecurityModal, renderSlaSettingsModal, toSecurityModalViewModel } from '../templates/security-modal-template.ts'
```

- [ ] **Step 5: Run tests and typecheck**

```bash
bun test tests/unit/templates/security-modal-template.test.ts
bun x tsc --noEmit
bun run check
```

Expected: all 17 tests pass, no errors.

- [ ] **Step 6: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/templates/security-modal-template.ts src/routes/security-route.ts tests/unit/templates/security-modal-template.test.ts
git commit -m "feat(security): add SLA settings modal and GET/POST /api/settings/sla routes"
```

---

## Task 12: Wire new routes into index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update `src/index.ts`**

Add import:

```ts
import { createSecurityRoutes } from './routes/security-route.ts'
```

Add to the routes array (after `createModalRoutes`):

```ts
  ...createSecurityRoutes(repos.security, repos.sla),
```

- [ ] **Step 2: Typecheck and lint**

```bash
bun x tsc --noEmit
bun run check
```

Expected: no errors.

- [ ] **Step 3: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(security): wire security and SLA routes into composition root"
```

---

## Task 13: E2E tests

**Files:**
- Modify: `tests/e2e/seed-db.ts`
- Modify: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Seeds repos with security alerts of known ages to test badge, modal, SLA overdue indicators

- [ ] **Step 1: Update `tests/e2e/seed-db.ts` — add security alert seeding**

Add `SecurityAlert` to the import from types:

```ts
import type { Activity, PullRequest, SecurityAlert } from '../../src/db/types.ts'
```

Add security alert seeding at the end of `seedTestDb`, before `repos.close()`:

```ts
  // Security alerts for alice/awesome-project
  // critical, 10 days old → over 7d SLA → (!) on Critical
  // high, 15 days old → within 30d SLA → no (!)
  // medium, 100 days old → over 90d SLA → (!) on Medium
  // low, 50 days old → within 180d SLA → no (!)
  const secNow = new Date()
  const securityAlerts: SecurityAlert[] = [
    {
      repoFullName: 'alice/awesome-project',
      number: 1,
      ecosystem: 'npm',
      packageName: 'lodash',
      title: 'Prototype Pollution in lodash',
      severity: 'critical',
      cvssScore: 9.8,
      createdAt: new Date(secNow.getTime() - 10 * 86_400_000),
      htmlUrl: 'https://github.com/alice/awesome-project/security/dependabot/1',
    },
    {
      repoFullName: 'alice/awesome-project',
      number: 2,
      ecosystem: 'pip',
      packageName: 'requests',
      title: 'SSRF in requests library',
      severity: 'high',
      cvssScore: 7.5,
      createdAt: new Date(secNow.getTime() - 15 * 86_400_000),
      htmlUrl: 'https://github.com/alice/awesome-project/security/dependabot/2',
    },
    {
      repoFullName: 'alice/awesome-project',
      number: 3,
      ecosystem: 'go',
      packageName: 'golang.org/x/net',
      title: 'HTTP/2 vulnerability',
      severity: 'medium',
      cvssScore: 5.3,
      createdAt: new Date(secNow.getTime() - 100 * 86_400_000),
      htmlUrl: 'https://github.com/alice/awesome-project/security/dependabot/3',
    },
    {
      repoFullName: 'alice/awesome-project',
      number: 4,
      ecosystem: 'npm',
      packageName: 'minimist',
      title: 'Prototype Pollution in minimist',
      severity: 'low',
      cvssScore: null,
      createdAt: new Date(secNow.getTime() - 50 * 86_400_000),
      htmlUrl: 'https://github.com/alice/awesome-project/security/dependabot/4',
    },
  ]
  repos.security.upsertAlerts('alice/awesome-project', securityAlerts)

  // Default SLA settings (industry standard) — already the default, but explicit for test clarity
  repos.sla.setSla({ critical: 7, high: 30, medium: 90, low: 180 })
```

- [ ] **Step 2: Add E2E security tests to `tests/e2e/dashboard.spec.ts`**

Add a new describe block at the end of the file:

```ts
test.describe('security badge', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/api/test/restore-session', { waitUntil: 'commit' })
    await page.goto('/')
    await page.waitForSelector('.card')
  })

  test('shows security badge with severity counts on card', async ({ page }) => {
    const card = page.locator('.card').first()
    await expect(card).toContainText('Critical')
    await expect(card).toContainText('1')
    await expect(card).toContainText('High')
    await expect(card).toContainText('Medium')
    await expect(card).toContainText('Low')
  })

  test('shows overdue indicator on critical and medium (over SLA), not on high and low', async ({ page }) => {
    const card = page.locator('.card').first()
    const badgeHtml = await card.locator('button[hx-get*="/api/security"]').innerHTML()
    // Critical 10d old > 7d SLA → (!) expected
    // Medium 100d old > 90d SLA → (!) expected
    // The (!) spans are only inside the overdue severity spans
    const criticalSpan = card.locator('button[hx-get*="/api/security"] span').filter({ hasText: 'Critical' })
    await expect(criticalSpan).toContainText('(!)')
    expect(badgeHtml).toContain('(!)')
  })

  test('opens security modal on badge click', async ({ page }) => {
    const card = page.locator('.card').first()
    await card.locator('button[hx-get*="/api/security"]').click()
    await page.waitForSelector('#modal table')
    const modal = page.locator('#modal')
    await expect(modal).toContainText('Security Alerts')
    await expect(modal).toContainText('alice/awesome-project')
  })

  test('security modal shows all 4 alerts sorted by severity', async ({ page }) => {
    const card = page.locator('.card').first()
    await card.locator('button[hx-get*="/api/security"]').click()
    await page.waitForSelector('#modal table')
    const rows = page.locator('#modal table tbody tr')
    await expect(rows).toHaveCount(4)
    // First row should be critical
    await expect(rows.first()).toContainText('Critical')
  })

  test('opens SLA settings modal on gear icon click', async ({ page }) => {
    const card = page.locator('.card').first()
    await card.locator('button[hx-get="/api/settings/sla"]').click()
    await page.waitForSelector('#modal form')
    const modal = page.locator('#modal')
    await expect(modal).toContainText('Security SLA Settings')
    await expect(modal).toContainText('industry standard')
  })
})
```

- [ ] **Step 3: Run E2E tests**

```bash
bun run test:e2e
```

Expected: all new security badge tests pass.

- [ ] **Step 4: Run full unit suite once more**

```bash
bun test tests/unit
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/seed-db.ts tests/e2e/dashboard.spec.ts
git commit -m "test(e2e): add security badge, modal, and SLA settings E2E tests"
```
