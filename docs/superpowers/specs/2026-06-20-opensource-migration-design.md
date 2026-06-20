# GitHub Dashboard — Open Source Migration Design

**Date:** 2026-06-20  
**Status:** Approved

## Overview

Migration des bestehenden Single-File DC-Framework-Dashboards zu einem vollständig typisierten, testbaren Open-Source-Projekt. Das Dashboard läuft lokal als Bun HTTP-Server und zeigt GitHub-Repositories mit PRs, CI-Status und Dependabot-Alerts in Echtzeit.

---

## Tech Stack

| Bereich | Technologie | Begründung |
|---|---|---|
| Runtime / Build | **Bun** | Schnell, built-in SQLite, built-in Testrunner, kein separater Build-Step |
| Sprache | **TypeScript** | Strikte Typsicherheit, `readonly` überall |
| UI | **Server-side HTML Templates** + **HTMX** (CDN) | Kein Frontend-Framework, kein Bundle, schlanke Abhängigkeiten |
| Datenbank | **SQLite** via `bun:sqlite` | Ersetzt localStorage, lokal, kein Server nötig |
| Linter / Formatter | **Biome** | Ersetzt ESLint + Prettier in einem Tool |
| Unit-Tests | **Bun test** | Built-in, kein Jest/Vitest nötig |
| E2E-Tests | **Playwright** | Browser-Tests gegen lokalen Bun-Server |
| Git Hooks | **Husky** + **commitlint** | Pre-commit (lint, typecheck, tests) + Conventional Commits |
| CI | **GitHub Actions** | Lint, typecheck, unit tests, e2e tests |

---

## Architektur

### Schichten

```
src/
  db/
    repos.ts              ← Repos-Interface (zentraler Einstiegspunkt)
    migrations.ts         ← Schema-Setup via PRAGMA user_version
    sqlite-repository.ts  ← createSqliteRepos(dbPath): Repos
    auth/
      auth-repo.ts        ← Interface
      sqlite-auth-repo.ts ← Konkrete Impl (db injected)
    cards/
      card-repo.ts
      sqlite-card-repo.ts
    pull-requests/
      pr-repo.ts
      sqlite-pr-repo.ts
    dependabot/
      dependabot-repo.ts
      sqlite-dependabot-repo.ts
  github/
    github-client.ts      ← fetch-Wrapper, PAT injected, stateless
  services/
    card-service.ts       ← Orchestriert Repos + GitHub Client
    pr-service.ts
    dependabot-service.ts
  routes/
    auth-route.ts
    card-route.ts
    pr-route.ts
  templates/
    page-template.ts
    card-template.ts
    modal-template.ts
    pr-modal-template.ts
    styles.ts
  server.ts               ← startServer(port, routes)
  index.ts                ← Komposition: Repos → Services → Routes → Server

tests/
  unit/
    helpers/
      temp-db.ts          ← createTempDbPath / cleanupTempDir
    db/                   ← Repository-Tests gegen echte SQLite
    services/             ← Service-Tests (GitHub Client gemockt via fetch-mock)
    templates/            ← Template-Output-Tests
    routes/               ← Route-Tests mit injizierten Services
  e2e/
    seed-db.ts
    dashboard.spec.ts
    auth.spec.ts
```

### Dependency-Injection-Pattern

```ts
// src/index.ts — einzige Stelle, wo alles zusammengebaut wird
const repos = createSqliteRepos(dbPath)
const client = createGitHubClient(repos.auth)
const cardService = createCardService(repos, client)
const routes = [
  createAuthRoute(repos.auth, client),
  createCardRoute(cardService),
  createPrRoute(repos.pullRequests, client),
]
startServer(4242, routes)
```

**Regeln:**
- Domain-Typen sind `readonly` (Immutability by default)
- Services sind stateless (kein `this`, nur reine Funktionen mit injizierten Abhängigkeiten)
- DB-Zugriff ausschließlich über Repository-Methoden
- Keine globalen Singletons

---

## SQLite-Schema

```sql
-- PAT + GitHub-User-Info
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Verwendete Keys: 'pat', 'username', 'avatar_url'

-- Gepinnte Repos mit Reihenfolge
CREATE TABLE pinned_repos (
  full_name  TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL DEFAULT 0,
  pinned_at  TEXT NOT NULL
);

-- Gecachte Repo-Daten (wird bei jedem Refresh überschrieben)
CREATE TABLE repo_cache (
  full_name         TEXT PRIMARY KEY,
  last_commit_at    TEXT,
  pr_total          INTEGER NOT NULL DEFAULT 0,
  dependabot_count  INTEGER,   -- NULL = kein Scope-Zugriff
  cached_at         TEXT NOT NULL
);

-- Einzelne PRs (UPSERT bei jedem Refresh)
CREATE TABLE pull_requests (
  repo_full_name  TEXT NOT NULL,
  number          INTEGER NOT NULL,
  title           TEXT NOT NULL,
  draft           INTEGER NOT NULL DEFAULT 0,
  ci_status       TEXT NOT NULL DEFAULT 'unknown',
  pr_url          TEXT NOT NULL,
  creator         TEXT NOT NULL,
  labels          TEXT NOT NULL DEFAULT '[]',  -- JSON
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (repo_full_name, number)
);

-- Dependabot-Verlauf für Trend-Berechnung (1W, 1M, 6M)
CREATE TABLE dependabot_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_full_name  TEXT NOT NULL,
  count           INTEGER NOT NULL,
  recorded_at     TEXT NOT NULL
);
-- Snapshots max. alle 30 Minuten; Daten älter als 183 Tage werden gelöscht
```

### Domain-Typen

```ts
type CiStatus = 'success' | 'failure' | 'pending' | 'unknown'

type AuthToken = {
  readonly pat: string
  readonly username: string
  readonly avatarUrl: string
}

type PinnedRepo = {
  readonly fullName: string
  readonly sortOrder: number
  readonly pinnedAt: Date
}

type PullRequest = {
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

type Label = {
  readonly name: string
  readonly color: string  -- hex ohne '#'
}

type DependabotTrend = {
  readonly week: number | null
  readonly month: number | null
  readonly sixMonths: number | null
}
```

---

## HTTP-Routes

```
GET  /                          → Volle Dashboard-Seite
GET  /api/cards                 → Alle Card-Fragmente (HTMX auto-refresh)
GET  /api/card/:owner/:repo     → Einzelne Card
GET  /api/modal/repos           → Repo-Auswahl Modal
GET  /api/repos/search?q=...    → Gefilterter Repo-List-Fragment
GET  /api/prs/:owner/:repo      → Volle PR-Liste
POST /api/auth                  → PAT speichern + validieren
DELETE /api/auth                → Disconnect
POST /api/cards/:owner/:repo    → Pin/Unpin toggle
POST /api/cards/reorder         → Neue Reihenfolge (JSON-Body)
```

## HTMX-Interaktionen

```html
<!-- Auto-Refresh -->
<div id="cards"
  hx-get="/api/cards"
  hx-trigger="every 10s, cardsChanged from:body"
  hx-swap="innerHTML">

<!-- Einzelne Card -->
<button
  hx-get="/api/card/owner/repo"
  hx-target="closest .card"
  hx-swap="outerHTML">

<!-- Repo-Modal öffnen -->
<button
  hx-get="/api/modal/repos"
  hx-target="#modal"
  hx-swap="innerHTML">

<!-- Repo-Suche (live) -->
<input
  hx-get="/api/repos/search"
  hx-trigger="input changed delay:200ms"
  hx-target="#repo-list"
  hx-swap="innerHTML">
```

**Drag & Drop:** ~30 Zeilen Vanilla JS. `dragend` → `POST /api/cards/reorder` → Server antwortet mit `HX-Trigger: cardsChanged` → HTMX feuert auto-refresh.

## ViewModel-Pattern

Services geben Domain-Typen zurück. Routes konvertieren diese in ViewModels mit aufgelösten Display-Werten — keine Logik in Templates.

```ts
const viewModel: CardViewModel = {
  fullName: card.fullName,
  lastCommit: formatRelative(cache.lastCommitAt),   // "vor 2 Std."
  ciDotColor: ciColor(overallCi),                   // '#3fb950'
  depDisplay: cache.dependabotCount?.toString() ?? '—',
  depTrend: formatTrend(trend),                     // '(+2, -1, +5)'
}
```

---

## Testing-Strategie

### Unit-Tests (Bun test)

- **Repositories:** Echte SQLite via `createTempDbPath` — kein Mocking der DB
- **Services:** Repositories real, GitHub Client via fetch-mock ersetzt
- **Templates:** HTML-Output gegen Strings assertieren
- **Routes:** Services injected, `Request` direkt konstruiert

```ts
// Beispiel Behavior-Test
describe("CardRepo", () => {
  test("reorder changes sort_order", () => {
    const { dir, dbPath } = createTempDbPath("gh-dash-cards-")
    const repos = createSqliteRepos(dbPath)

    repos.cards.pin("alice/beta", 0)
    repos.cards.pin("alice/alpha", 1)
    repos.cards.reorder(["alice/alpha", "alice/beta"])

    const pinned = repos.cards.getPinned()
    expect(pinned.map(r => r.fullName)).toEqual(["alice/alpha", "alice/beta"])

    repos.close()
    cleanupTempDir(dir)
  })
})
```

### E2E-Tests (Playwright)

- `seed-db.ts` befüllt Test-SQLite mit Fixtures (Mock-PAT, gepinnte Repos)
- Server startet gegen Test-DB
- Tests decken volle Browser-Flows ab: Auth, Card-Ansicht, Modal, Refresh

---

## Tooling & CI

### Husky Hooks

```bash
# .husky/pre-commit
bun run check       # Biome lint + format
bun x tsc --noEmit  # Typecheck
bun test tests/unit # Unit-Tests

# .husky/commit-msg
bunx commitlint --edit $1
```

### Conventional Commits

Format: `type(scope): description`  
Typen: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`

### GitHub Actions

```yaml
# .github/workflows/ci.yml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run check
      - run: bun x tsc --noEmit
      - run: bun test tests/unit
      - run: bunx playwright install --with-deps chromium
      - run: bun run src/index.ts &
      - run: sleep 2 && playwright test
```

### package.json Scripts

```json
{
  "scripts": {
    "start":     "bun run src/index.ts",
    "dev":       "bun --watch run src/index.ts",
    "check":     "biome check .",
    "check:fix": "biome check --write .",
    "typecheck": "bun x tsc --noEmit",
    "test":      "bun test tests/unit",
    "test:e2e":  "playwright test"
  }
}
```

---

## Nicht im Scope (bewusst ausgelassen)

- Electron / Desktop-Packaging (läuft lokal im Browser)
- Multi-User / Auth-Server
- Cloud-Deployment
- Plugin-System
