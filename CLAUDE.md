# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A local GitHub Dashboard — open-source, runs as a Bun HTTP server, shows GitHub repositories with PRs, CI status and Dependabot alerts. Auth and data are persisted in SQLite.

## Commands

```bash
bun run dev          # Start with file-watching (development)
bun run start        # Start server (production)
bun run check        # Biome lint + format check
bun run check:fix    # Biome lint + format (auto-fix)
bun x tsc --noEmit   # Type check
bun test tests/unit  # Unit tests
bun run test:e2e     # Playwright e2e tests
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Language | TypeScript (strict, `readonly` by default) |
| HTTP server | `Bun.serve` |
| UI | Server-side HTML template functions + HTMX (CDN, no build step) |
| Database | SQLite via `bun:sqlite` |
| Linter / Formatter | Biome (`biome.json`) |
| Unit tests | Bun test (`tests/unit/`) |
| E2E tests | Playwright (`tests/e2e/`) |
| Git hooks | Husky — pre-commit runs check + typecheck + unit tests; commit-msg enforces Conventional Commits |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |

## Architecture

Three-layer Clean Architecture — domain types, SQLite repositories, HTTP application layer.

```
src/
  db/
    repos.ts              ← Repos interface (central entry point)
    migrations.ts         ← Schema via PRAGMA user_version
    sqlite-repository.ts  ← createSqliteRepos(dbPath): Repos
    auth/                 ← auth-repo.ts (interface) + sqlite-auth-repo.ts
    cards/                ← card-repo.ts + sqlite-card-repo.ts
    pull-requests/        ← pr-repo.ts + sqlite-pr-repo.ts
    dependabot/           ← dependabot-repo.ts + sqlite-dependabot-repo.ts
  github/
    github-client.ts      ← Stateless fetch wrapper, PAT injected
  services/               ← Orchestrate repos + GitHub client; stateless functions
  routes/                 ← HTTP route handlers, services injected
  templates/              ← TypeScript functions returning HTML strings
  server.ts               ← startServer(port, routes)
  index.ts                ← Composition root: Repos → Services → Routes → Server
```

**Composition root** (`index.ts`) is the only place where dependencies are wired:
```ts
const repos = createSqliteRepos(dbPath)
const client = createGitHubClient(repos.auth)
const cardService = createCardService(repos, client)
startServer(4242, [createCardRoute(cardService), ...])
```

**Rules:**
- DB access only through repository methods — never raw SQL outside of `src/db/`
- Services are stateless (pure functions with injected dependencies, no `this`)
- All domain types are `readonly` / immutable
- No global singletons

## SQLite Schema

5 tables: `settings` (key-value: pat, username, avatar_url), `pinned_repos` (full_name, sort_order), `repo_cache` (last_commit_at, pr_total, dependabot_count), `pull_requests` (per-repo PRs with ci_status, labels as JSON), `dependabot_history` (snapshots max every 30 min, pruned after 183 days).

Schema is versioned via `PRAGMA user_version`. See `src/db/migrations.ts`.

## Testing

**Unit tests use real SQLite** — no DB mocking. Use `createTempDbPath` from `tests/unit/helpers/temp-db.ts`:

```ts
const { dir, dbPath } = createTempDbPath("gh-dash-cards-")
const repos = createSqliteRepos(dbPath)
// test behavior...
repos.close()
cleanupTempDir(dir)
```

GitHub Client is mocked via fetch-mock in service tests (not the DB).

**E2E tests** use `tests/e2e/seed-db.ts` to populate a test SQLite DB, then run Playwright against a started Bun server.

## UI Patterns

Templates are TypeScript functions returning HTML strings. No JSX, no frontend framework, no build step for the UI.

HTMX handles partial updates via attributes (`hx-get`, `hx-swap`, `hx-trigger`). Drag & drop is ~30 lines of vanilla JS. The server responds with HTML fragments and uses `HX-Trigger: cardsChanged` headers to coordinate refreshes.

ViewModels are computed in route handlers (not in templates) — relative timestamps, CI colors, badge text are all resolved before reaching the template function.

## Conventions

- **Conventional Commits**: `feat(cards): add reorder endpoint`, `fix(auth): handle 403 on expired token`
- **Biome** for all linting and formatting — no ESLint, no Prettier
- **No `Co-Authored-By: Claude` in commits**
- Branch protection: all CI checks must pass before merge
- **Language**: All code, tests, comments, and identifiers are written in English
- **TDD**: Every feature and bugfix requires tests (unit and/or e2e) written before implementation — no code ships without coverage
- **Code/Design separation**: Logic lives in services/repositories; presentation lives in templates — no business logic in templates, no HTML in services
