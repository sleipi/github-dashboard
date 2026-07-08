# Security Overview Design

**Date:** 2026-07-08
**Status:** Approved

## Summary

Replace the existing Dependabot count badge on each card with a full per-severity security overview. Alerts are fetched from the GitHub Dependabot API, persisted per-repo, and displayed as a compact severity breakdown with SLA overdue indicators. A modal shows full alert detail. SLA thresholds are configurable globally via a gear icon.

---

## Data Layer

### New table: `security_alerts`

```sql
CREATE TABLE security_alerts (
  repo_full_name TEXT NOT NULL,
  number         INTEGER NOT NULL,
  ecosystem      TEXT NOT NULL,
  package_name   TEXT NOT NULL,
  title          TEXT NOT NULL,
  severity       TEXT NOT NULL,  -- critical | high | medium | low
  cvss_score     REAL,           -- nullable; GitHub omits on some advisories
  created_at     TEXT NOT NULL,  -- ISO8601
  html_url       TEXT NOT NULL,
  PRIMARY KEY (repo_full_name, number)
)
```

Schema version bumped via `PRAGMA user_version`.

### SLA settings: existing `settings` key-value table

Four new keys with defaults:

| Key | Default |
|---|---|
| `sla_critical_days` | 7 |
| `sla_high_days` | 30 |
| `sla_medium_days` | 90 |
| `sla_low_days` | 180 |

### New `src/db/security/` module

**`security-alerts-repo.ts`** — interface:
- `upsertAlerts(fullName: string, alerts: SecurityAlert[]): void` — full replace for repo
- `getAlerts(fullName: string): SecurityAlert[]` — sorted severity + age
- `getSeverityCounts(fullName: string, sla: SlaSettings, now: Date): SecurityCounts`

**`sqlite-security-alerts-repo.ts`** — SQLite implementation.

### New `src/db/sla/` module

**`sla-repo.ts`** — interface:
- `getSla(): SlaSettings`
- `setSla(settings: SlaSettings): void`

**`sqlite-sla-repo.ts`** — reads/writes the 4 keys from `settings` table. Returns defaults when keys are absent.

### Extended `GitHubDependabotAlert`

Two new fields:

```ts
readonly ecosystem: string
readonly cvssScore: number | null
```

### New domain types (`src/db/types.ts`)

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

---

## Obsolete Code — Delete Entirely

The old Dependabot trend badge is replaced. Remove without backward-compatibility shims:

- `src/services/dependabot-service.ts` — `calculateTrend` (file likely empty after; delete)
- `DependabotTrend` type in `src/db/types.ts`
- `DependabotRepo` interface + `src/db/dependabot/sqlite-dependabot-repo.ts`
- `maybeRecordSnapshot` and `pruneOld` calls in `card-service.ts`
- Formatters: `formatDepBadgeTrend`, `formatDepLabel`, `depColor`, `depBgColor`
- `CardViewModel` fields: `depDisplay`, `depColor`, `depBg`, `depLabel`, `depBadgeTrend`, `hasDepBadgeTrend`, `securityUrl`
- `CardData.trend`
- All unit tests covering the above

**`dependabot_history` table:** stop writing new snapshots; do not drop the table (safe, just unused storage).

---

## Services

### `card-service.ts`

- `fetchSelective` calls `getDependabotAlerts` — extend to `upsertAlerts` into `security_alerts`
- `CardData` replaces `trend: DependabotTrend` with `securityCounts: SecurityCounts`
- `CardData` keeps `cache.dependabotCount` for null-check (no `security_events` scope detection)

### SLA settings access

`SlaRepo` is injected into the security modal route and the card service (for `getSeverityCounts`). Not mixed into `AuthRepo`.

---

## Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/security/:owner/:repo` | Security modal — full alert table |
| `GET` | `/api/settings/sla` | SLA config form fragment |
| `POST` | `/api/settings/sla` | Save SLA; responds `HX-Trigger: cardsChanged` |

---

## UI

### Card badge (replaces old `🛡` badge)

```
🔒 Critical 1  High 12 (!)  Medium 30  Low 13  ⚙
```

- Per-severity color coding: red / orange / yellow / grey
- `(!)` in red on any severity with ≥1 overdue alert
- Entire badge area: `hx-get="/api/security/:owner/:repo"` → `#modal`
- `⚙` icon: `hx-get="/api/settings/sla"` → `#modal`
- Zero alerts: `🔒 ✓` in green, not clickable
- No security scope (`dependabotCount === null`): `🔒 —` in grey, not clickable

### Security modal

Table sorted: severity order (critical first), then within severity: most overdue first, then oldest first.

Columns: **Ecosystem** · **Title** · **Severity** · **Score** · **Age**

- Overdue rows: subtle red row background tint
- Age cell: `43d · 13d over SLA` (red) or `25d` (neutral)
- Row click → opens `html_url` in new tab (entire row is an anchor)
- Severity shown as colored badge: 🔴 Critical / 🟠 High / 🟡 Medium / ⚪ Low

### SLA settings modal

```
Security SLA Settings

Critical  [  7  ] days   (industry standard: 7 days)
High      [ 30  ] days   (industry standard: 30 days)
Medium    [ 90  ] days   (industry standard: 90 days)
Low       [180  ] days   (industry standard: 180 days)

[Save]
```

- Industry standard hint shown as muted inline text per row
- Save: `POST /api/settings/sla` → `HX-Trigger: cardsChanged` → all cards refresh

---

## Testing

### Unit tests (real SQLite, no mocks)

- `SecurityAlertsRepo` — upsert replaces, get returns sorted, `getSeverityCounts` handles overdue calc
- `SlaRepo` — defaults returned when keys absent, roundtrip read/write
- SLA age calculation logic — pure function tests (no DB): overdue boundary conditions, exact-day edge cases
- `toCardViewModel` — security badge fields populated correctly from `SecurityCounts`
- Security modal template — HTML output contains correct row order, overdue tint, SLA text
- SLA settings template — form renders current values

### E2E (Playwright against seeded DB)

- Seed: one repo with alerts of known `created_at` values crossing SLA boundaries
- Verify card badge shows `(!)` on correct severities
- Verify modal opens with correct row count and order
- Verify SLA form saves and triggers card refresh
