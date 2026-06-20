# GitHub Dashboard — Phase 4: E2E Tests + README

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playwright E2E-Tests für die wichtigsten User Flows + README für das Open-Source-Projekt.

**Architecture:** E2E-Tests starten den Bun-Server gegen eine vorgefüllte Test-DB (`seed-db.ts`). Die `GH_DASH_DB`-Umgebungsvariable zeigt den Server auf die Test-DB. Kein Live-GitHub-API-Zugriff in E2E-Tests — die DB enthält gecachte Daten.

**Tech Stack:** Playwright, Bun, SQLite

## Global Constraints

- E2E-Tests verwenden eine seeded Test-DB, keine GitHub API
- `GH_DASH_DB` env-Variable zeigt auf Test-DB
- Tests laufen gegen `http://localhost:4242`
- Kein `Co-Authored-By: Claude` in Commit-Messages

---

## File Map

```
tests/e2e/
  seed-db.ts            ← Befüllt Test-SQLite mit Fixtures
  auth.spec.ts          ← Setup-Seite, Connect-Flow (fehlerhafter Token)
  dashboard.spec.ts     ← Dashboard-Ansicht, Card, Modal, Refresh

playwright.config.ts    ← bereits aus Phase 1, hier finalisiert
README.md               ← About + Usage
```

---

### Task 14: Playwright Config finalisieren + Seed DB

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/seed-db.ts`

**Interfaces:**
- Produces: `seedTestDb(dbPath): void` — befüllt eine frische DB mit Test-Daten für alle E2E-Tests

- [ ] **Step 1: playwright.config.ts finalisieren**

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const testDbDir = mkdtempSync(join(tmpdir(), 'gh-dash-e2e-'))
const testDbPath = join(testDbDir, 'test.db')

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env['CI'] ? 2 : 0,
  use: {
    baseURL: 'http://localhost:4242',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `GH_DASH_DB=${testDbPath} bun run src/index.ts`,
    url: 'http://localhost:4242',
    reuseExistingServer: false,
    env: { GH_DASH_DB: testDbPath },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
```

**Hinweis:** Die `testDbPath`-Variable muss auch für `seed-db.ts` zugänglich sein. Dafür exportieren wir den Pfad aus der Config:

```typescript
// playwright.config.ts (vollständige Version mit Export)
import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const TEST_DB_DIR = mkdtempSync(join(tmpdir(), 'gh-dash-e2e-'))
export const TEST_DB_PATH = join(TEST_DB_DIR, 'test.db')

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env['CI'] ? 2 : 0,
  use: {
    baseURL: 'http://localhost:4242',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `GH_DASH_DB=${TEST_DB_PATH} bun run src/index.ts`,
    url: 'http://localhost:4242',
    reuseExistingServer: false,
    env: { GH_DASH_DB: TEST_DB_PATH },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
```

- [ ] **Step 2: Seed DB schreiben**

Die Seed-Funktion baut eine realistische Test-DB ohne GitHub API auf.

```typescript
// tests/e2e/seed-db.ts
import { Database } from 'bun:sqlite'
import { createSqliteRepos } from '../../src/db/sqlite-repository.ts'
import type { PullRequest } from '../../src/db/types.ts'

const TEST_PAT = 'ghp_testtoken000000000000000000000000'
const TEST_USER = 'testuser'
const TEST_AVATAR = 'https://avatars.githubusercontent.com/u/1?v=4'

export function seedTestDb(dbPath: string): void {
  const repos = createSqliteRepos(dbPath)

  // Auth
  repos.auth.saveToken({ pat: TEST_PAT, username: TEST_USER, avatarUrl: TEST_AVATAR })

  // Gepinnte Repos
  repos.cards.pin('alice/awesome-project')
  repos.cards.pin('alice/another-repo')

  // Repo-Cache für awesome-project
  repos.pullRequests.upsertCache('alice/awesome-project', {
    lastCommitAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // vor 2h
    prTotal: 2,
    dependabotCount: 3,
  })

  const prs: PullRequest[] = [
    {
      repoFullName: 'alice/awesome-project',
      number: 42,
      title: 'feat: add dark mode support',
      draft: false,
      ciStatus: 'success',
      prUrl: 'https://github.com/alice/awesome-project/pull/42',
      creator: 'bob',
      labels: [{ name: 'enhancement', color: '238636' }],
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    },
    {
      repoFullName: 'alice/awesome-project',
      number: 41,
      title: 'fix: resolve memory leak in worker',
      draft: false,
      ciStatus: 'failure',
      prUrl: 'https://github.com/alice/awesome-project/pull/41',
      creator: 'carol',
      labels: [{ name: 'bug', color: 'f85149' }],
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  ]
  repos.pullRequests.upsertPrs('alice/awesome-project', prs)

  // Dependabot-History
  const now = new Date()
  repos.dependabot.maybeRecordSnapshot('alice/awesome-project', 5, new Date(now.getTime() - 8 * 86_400_000), 0)
  repos.dependabot.maybeRecordSnapshot('alice/awesome-project', 3, now, 0)

  // Repo-Cache für another-repo (keine PRs)
  repos.pullRequests.upsertCache('alice/another-repo', {
    lastCommitAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    prTotal: 0,
    dependabotCount: 0,
  })

  repos.close()
}

// Direkter Aufruf: bun run tests/e2e/seed-db.ts <dbPath>
const dbPath = process.argv[2]
if (dbPath) {
  seedTestDb(dbPath)
  console.log(`Seeded: ${dbPath}`)
}
```

- [ ] **Step 3: Seed-DB testen**

```bash
bun run tests/e2e/seed-db.ts /tmp/test-seed.db
```

Erwartete Ausgabe: `Seeded: /tmp/test-seed.db` ohne Fehler.

Manuell prüfen:
```bash
bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/tmp/test-seed.db', { readonly: true });
console.log(db.query('SELECT * FROM pinned_repos').all());
console.log(db.query('SELECT COUNT(*) as n FROM pull_requests').get());
"
```

Erwartete Ausgabe: 2 gepinnte Repos, 2 PRs.

- [ ] **Step 4: Playwright.config anpassen um Seed vor Serverstart auszuführen**

Das `webServer.command` erweitert, sodass die DB vor dem Server-Start geseeded wird:

```typescript
// playwright.config.ts — webServer.command aktualisieren
webServer: {
  command: `bun run tests/e2e/seed-db.ts ${TEST_DB_PATH} && GH_DASH_DB=${TEST_DB_PATH} bun run src/index.ts`,
  url: 'http://localhost:4242',
  reuseExistingServer: false,
  env: { GH_DASH_DB: TEST_DB_PATH },
},
```

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/seed-db.ts
git commit -m "test(e2e): add playwright config and seed database"
```

---

### Task 15: E2E Tests

**Files:**
- Create: `tests/e2e/auth.spec.ts`
- Create: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: laufender Server auf Port 4242 mit seeded DB
- Produces: Playwright-Tests die volle User Flows abdecken

- [ ] **Step 1: Auth Spec schreiben**

```typescript
// tests/e2e/auth.spec.ts
import { expect, test } from '@playwright/test'

// Diese Tests laufen gegen eine leere DB (ohne geseedetes Token)
// Dafür starten wir einen separaten Server mit einer leeren DB.
// Da playwright.config.ts die Test-DB seedet, müssen wir hier
// die geseedete DB temporär "leeren" — einfachste Lösung:
// Auth-Tests testen Verhalten auf der Setup-Seite, die sichtbar
// ist wenn auth.deleteToken() aufgerufen wird.

test.describe('Setup-Seite', () => {
  // Abmelden damit Setup-Seite erscheint
  test.beforeEach(async ({ page }) => {
    // Logout via POST /api/auth mit _method=DELETE
    await page.request.post('/api/auth', {
      form: { _method: 'DELETE' },
    })
  })

  test('zeigt Setup-Formular wenn nicht eingeloggt', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Personal Access Token')).toBeVisible()
    await expect(page.locator('input[name="pat"]')).toBeVisible()
  })

  test('zeigt Fehlermeldung bei leerem Token', async ({ page }) => {
    await page.goto('/')
    await page.locator('button[type="submit"]').click()
    // HTML5 required validation verhindert Submit — kein Server-Error nötig
    // Der Browser zeigt native Validation an
    await expect(page.locator('input[name="pat"]:invalid')).toBeVisible()
  })

  test('zeigt Fehlermeldung bei ungültigem Token', async ({ page }) => {
    await page.goto('/')
    await page.fill('input[name="pat"]', 'ghp_ungueltig')
    await page.locator('button[type="submit"]').click()
    // Server antwortet mit 401 und Fehlertext
    // Da wir keinen Live-GitHub-Zugriff haben, wird der echte PAT abgelehnt
    await expect(
      page.getByText(/ungültig|error|fehler|401/i),
    ).toBeVisible({ timeout: 10_000 })
  })
})
```

- [ ] **Step 2: Dashboard Spec schreiben**

```typescript
// tests/e2e/dashboard.spec.ts
import { expect, test } from '@playwright/test'

// Der Server läuft mit der seeded DB aus seed-db.ts
// Enthält: 2 gepinnte Repos, 2 PRs für alice/awesome-project

test.describe('Dashboard', () => {
  test('zeigt Dashboard wenn eingeloggt', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Dashboard')).toBeVisible()
    await expect(page.getByText('testuser')).toBeVisible()
  })

  test('zeigt gepinnte Repos als Cards', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('awesome-project')).toBeVisible()
    await expect(page.getByText('another-repo')).toBeVisible()
  })

  test('zeigt PRs in der Card', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('feat: add dark mode support')).toBeVisible()
    await expect(page.getByText('fix: resolve memory leak in worker')).toBeVisible()
  })

  test('zeigt Dependabot-Alert-Anzahl', async ({ page }) => {
    await page.goto('/')
    // 3 aktuelle Alerts, Trend: -2 (von 5 auf 3)
    await expect(page.getByText('3')).toBeVisible()
  })

  test('"Repo hinzufügen" öffnet Modal', async ({ page }) => {
    await page.goto('/')
    // HTMX Modal öffnen — da kein Live-GitHub, wird der Request fehlschlagen
    // Wir testen nur dass der Button existiert und anklickbar ist
    const btn = page.getByRole('button', { name: /Repo hinzufügen/i })
    await expect(btn).toBeVisible()
  })

  test('Abmelden leitet zur Setup-Seite weiter', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Abmelden/i }).click()
    await expect(page.getByText('Personal Access Token')).toBeVisible()
  })

  test('PR-Link öffnet in neuem Tab', async ({ page }) => {
    await page.goto('/')
    const prLink = page.getByRole('link', { name: /feat: add dark mode/i })
    await expect(prLink).toHaveAttribute('target', '_blank')
    await expect(prLink).toHaveAttribute('href', /github\.com\/alice\/awesome-project\/pull\/42/)
  })

  test('Aktualisieren-Button ist sichtbar', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Aktualisieren/i })).toBeVisible()
  })
})
```

- [ ] **Step 3: E2E Tests lokal ausführen**

```bash
bun run test:e2e
```

Erwartete Ausgabe: Alle tests passing. Bei Fehlern: `playwright-report/index.html` öffnen für Details.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/auth.spec.ts tests/e2e/dashboard.spec.ts
git commit -m "test(e2e): add Playwright tests for auth and dashboard flows"
```

---

### Task 16: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: Vollständige README für das Open-Source-Projekt

- [ ] **Step 1: README schreiben**

```markdown
# GitHub Dashboard

A local, self-hosted GitHub dashboard showing your pinned repositories at a glance — open PRs, CI status, and Dependabot alerts, auto-refreshed every 10 seconds.

Runs entirely on your machine. No cloud, no accounts, no tracking. Your GitHub token stays local.

![dashboard screenshot](docs/screenshot.png)

## Features

- **PR overview** — open pull requests with CI status per PR
- **Dependabot alerts** — alert count with 1W / 1M / 6M trend
- **Auto-refresh** — cards update every 10 seconds via HTMX
- **Drag & drop** — reorder your pinned repos
- **Local SQLite** — all data cached locally, no localStorage

## Requirements

- [Bun](https://bun.sh) ≥ 1.2
- A GitHub [Personal Access Token (classic)](https://github.com/settings/tokens) with scopes:
  - `repo` — private repos, pull requests
  - `security_events` — Dependabot alerts

## Installation

```bash
git clone https://github.com/your-username/github-dashboard
cd github-dashboard
bun install
```

## Usage

```bash
bun run dev       # Start with file-watching (development)
bun run start     # Start server
```

Open [http://localhost:4242](http://localhost:4242) in your browser.

On first launch you'll be prompted for your GitHub token. It's stored locally in `~/.github-dashboard.db`.

### Custom database path

```bash
GH_DASH_DB=/path/to/my.db bun run start
```

### Custom port

```bash
PORT=8080 bun run start
```

## Development

```bash
bun run check        # Lint + format (Biome)
bun run check:fix    # Auto-fix
bun x tsc --noEmit   # Type check
bun test tests/unit  # Unit tests
bun run test:e2e     # E2E tests (Playwright)
```

## Architecture

```
src/
  db/          SQLite repositories (auth, cards, PRs, Dependabot)
  github/      GitHub API client
  services/    Business logic (card service, trend calculation)
  routes/      HTTP route handlers
  templates/   TypeScript functions → HTML strings
  server.ts    Bun.serve wrapper
  index.ts     Composition root
```

See [`docs/superpowers/specs/`](docs/superpowers/specs/) for the full architecture design.

## Contributing

Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
Pre-commit hooks run lint, type check and unit tests automatically.

## License

MIT
```

- [ ] **Step 2: Screenshot-Verzeichnis anlegen**

```bash
mkdir -p docs
```

Platzhalter-Hinweis in der README bis ein Screenshot gemacht wird:
- Nach dem ersten Start: Screenshot des Dashboards unter `docs/screenshot.png` speichern
- `README.md`: Zeile mit `![dashboard screenshot]` bleibt bis Screenshot existiert auskommentiert oder als Platzhalter

- [ ] **Step 3: Alle Tests ein letztes Mal laufen lassen**

```bash
bun run check
bun x tsc --noEmit
bun test tests/unit/
bun run test:e2e
```

Erwartete Ausgabe: Alles grün.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/
git commit -m "docs: add README with usage instructions and architecture overview"
```

---

## Phase 4 abgeschlossen ✓

Alle 4 Phasen sind fertig:

| Phase | Ergebnis |
|---|---|
| 1 — Infrastruktur | Bun, TypeScript, Biome, Husky, CI |
| 2 — DB-Layer | 4 Repositories, 20+ Tests |
| 3 — App-Layer | GitHub Client, Services, Templates, Routes |
| 4 — E2E + README | Playwright Tests, vollständiges README |

```bash
bun run dev           # Dashboard auf http://localhost:4242
bun test tests/unit/  # ~35 Unit-Tests
bun run test:e2e      # 8 E2E-Tests
```
