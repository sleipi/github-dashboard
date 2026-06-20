# GitHub Dashboard — Phase 1: Infrastruktur

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vollständiges Projekt-Tooling aufsetzen — Bun, TypeScript, Biome, Husky, Conventional Commits, GitHub Actions CI.

**Architecture:** Keine Anwendungslogik in dieser Phase. Nur Tooling-Konfiguration, die alle späteren Phasen nutzen.

**Tech Stack:** Bun, TypeScript (strict), Biome, Husky, commitlint, GitHub Actions

## Global Constraints

- Bun ≥ 1.2 als Runtime (kein Node.js)
- TypeScript strict mode + `noUncheckedIndexedAccess: true`
- Biome für Lint + Format (kein ESLint, kein Prettier)
- Conventional Commits: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`
- Kein `Co-Authored-By: Claude` in Commit-Messages
- Server läuft auf Port 4242

---

## File Map

```
package.json                    ← Bun-Projekt, scripts, devDependencies
tsconfig.json                   ← TypeScript strict config
biome.json                      ← Lint + Format rules
commitlint.config.ts            ← Conventional Commits config
.husky/
  pre-commit                    ← check + typecheck + unit tests
  commit-msg                    ← commitlint
.github/
  workflows/
    ci.yml                      ← Lint, typecheck, unit tests, e2e
src/
  index.ts                      ← Minimal Einstiegspunkt (Platzhalter)
```

---

### Task 1: package.json + tsconfig.json + biome.json

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `src/index.ts`

**Interfaces:**
- Produces: `bun run check`, `bun x tsc --noEmit`, `bun test`, `bun run dev` als funktionierende Befehle

- [ ] **Step 1: package.json erstellen**

```json
{
  "name": "github-dashboard",
  "version": "0.1.0",
  "description": "Local GitHub dashboard — PRs, CI status, Dependabot alerts at a glance",
  "type": "module",
  "license": "MIT",
  "scripts": {
    "start":     "bun run src/index.ts",
    "dev":       "bun --watch run src/index.ts",
    "check":     "biome check .",
    "check:fix": "biome check --write .",
    "typecheck": "bun x tsc --noEmit",
    "test":      "bun test tests/unit",
    "test:e2e":  "playwright test",
    "prepare":   "husky"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0",
    "@playwright/test": "^1.45.0",
    "@types/bun": "^1.1.0",
    "husky": "^9.0.0",
    "playwright": "^1.45.0"
  }
}
```

- [ ] **Step 2: tsconfig.json erstellen**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: biome.json erstellen**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      },
      "style": {
        "useConst": "error",
        "noVar": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "all",
      "semicolons": "asNeeded"
    }
  },
  "files": {
    "ignore": ["dist", "node_modules", ".husky"]
  }
}
```

- [ ] **Step 4: Minimalen Einstiegspunkt erstellen**

```typescript
// src/index.ts
console.log('GitHub Dashboard — starting on http://localhost:4242')
```

- [ ] **Step 5: Dependencies installieren**

```bash
bun install
```

Erwartete Ausgabe: `bun install v1.x.x` mit installierten Paketen ohne Fehler.

- [ ] **Step 6: Biome und TypeScript prüfen**

```bash
bun run check
bun x tsc --noEmit
```

Erwartete Ausgabe: Beide Befehle ohne Fehler (0 exit code).

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json biome.json src/index.ts bun.lock
git commit -m "chore: add project scaffolding — Bun, TypeScript, Biome"
```

---

### Task 2: Husky + commitlint

**Files:**
- Create: `commitlint.config.ts`
- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`

**Interfaces:**
- Consumes: `bun run check`, `bun x tsc --noEmit`, `bun test tests/unit` aus Task 1
- Produces: Git-Hooks die automatisch bei `git commit` laufen

- [ ] **Step 1: Husky initialisieren**

```bash
bunx husky init
```

Erwartete Ausgabe: `.husky/pre-commit` wird erstellt (mit Platzhalter-Inhalt).

- [ ] **Step 2: commitlint.config.ts erstellen**

```typescript
// commitlint.config.ts
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'ci'],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
  },
}
```

- [ ] **Step 3: pre-commit hook schreiben**

```bash
# .husky/pre-commit
bun run check
bun x tsc --noEmit
bun test tests/unit
```

- [ ] **Step 4: commit-msg hook schreiben**

```bash
# .husky/commit-msg
bunx commitlint --edit "$1"
```

- [ ] **Step 5: Hook-Permissions setzen**

```bash
chmod +x .husky/pre-commit .husky/commit-msg
```

- [ ] **Step 6: Tests-Verzeichnis anlegen damit pre-commit nicht scheitert**

```bash
mkdir -p tests/unit
```

```typescript
// tests/unit/.gitkeep — leere Datei, hält das Verzeichnis in git
```

- [ ] **Step 7: Hooks testen**

Einen gültigen Commit versuchen:
```bash
git add commitlint.config.ts .husky/ tests/
git commit -m "chore: add husky and commitlint"
```

Erwartete Ausgabe: pre-commit läuft (check + typecheck + tests), commit-msg validiert Format — Commit wird angenommen.

- [ ] **Step 8: Ungültigen Commit testen (manuell)**

```bash
git commit --allow-empty -m "bad commit message"
```

Erwartete Ausgabe: `commitlint` bricht mit Fehler ab — Commit wird abgelehnt.
Danach: `git reset HEAD` falls nötig.

---

### Task 3: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Scripts aus `package.json` (Task 1)
- Produces: CI-Pipeline die bei jedem Push und PR läuft

- [ ] **Step 1: CI-Workflow erstellen**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Lint, Type-Check & Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint + Format (Biome)
        run: bun run check

      - name: Type-Check
        run: bun x tsc --noEmit

      - name: Unit Tests
        run: bun test tests/unit

      - name: Install Playwright Chromium
        run: bunx playwright install --with-deps chromium

      - name: Start server (background)
        run: bun run src/index.ts &

      - name: Wait for server
        run: |
          for i in $(seq 1 10); do
            curl -sf http://localhost:4242 && break || sleep 1
          done

      - name: E2E Tests
        run: bun run test:e2e
```

- [ ] **Step 2: playwright.config.ts Platzhalter erstellen**

Die E2E-Tests werden in Phase 4 geschrieben, aber Playwright braucht eine Config damit `bun run test:e2e` nicht mit einem Fehler abbricht:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:4242',
  },
  webServer: {
    command: 'bun run src/index.ts',
    url: 'http://localhost:4242',
    reuseExistingServer: true,
  },
})
```

- [ ] **Step 3: .gitignore für test-artifacts erweitern**

```
# append to existing .gitignore
test-results/
playwright-report/
```

- [ ] **Step 4: Commit**

```bash
git add .github/ playwright.config.ts .gitignore
git commit -m "ci: add GitHub Actions workflow and Playwright config"
```

---

## Phase 1 abgeschlossen ✓

Ergebnis:
- `bun install` → installiert alle Dev-Dependencies
- `bun run check` → Biome Lint + Format
- `bun x tsc --noEmit` → TypeScript strict check
- `bun test tests/unit` → Unit-Test-Runner bereit
- `bun run dev` → Startet `src/index.ts` mit File-Watching
- Git-Hooks: pre-commit validiert, commit-msg erzwingt Conventional Commits
- CI-Pipeline läuft bei Push/PR auf main

**Nächste Phase:** `2026-06-20-phase-2-database.md` — Domain types, Migrations, alle 4 Repositories
