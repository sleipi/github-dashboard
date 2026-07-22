# GitHub Dashboard

A local, self-hosted dashboard for your pinned GitHub repositories — open PRs, CI status, and Dependabot alerts, all in one view, auto-refreshed every 10 seconds.

![dashboard screenshot](docs/screenshots/dashboard-v1.png)

## Why

Checking a handful of repos means a browser full of tabs: one for PRs, one for Actions, one for Dependabot. This tool puts all of it on a single page you can glance at.

- **Local-first** — runs on your machine, one Bun process, one SQLite file. No cloud service, no account, no telemetry.
- **Your token stays yours** — the GitHub PAT is stored locally, never sent anywhere but the GitHub API.
- **Zero build step** — server-rendered HTML + HTMX. No bundler, no framework, no `node_modules` black hole.
- **Actually fast** — cards update via small HTML fragments, not a full page reload or a client-side SPA.

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

Useful to try the dashboard against a throwaway test DB without touching your real data:

```bash
GH_DASH_DB=./demo.db bun run src/index.ts
```

### Custom port

```bash
PORT=8080 bun run start
```

## Development

Tooling is Bun + Biome — no ESLint, no Prettier, no separate test runner config.

```bash
bun run check        # Lint + format (Biome)
bun run check:fix    # Auto-fix
bun x tsc --noEmit   # Type check
bun test tests/unit  # Unit tests
bun run test:e2e     # E2E tests (Playwright)
```

### Tests

Unit tests (`tests/unit/`) run against a **real SQLite database**, not mocks — each test spins up a temp DB via `tests/unit/helpers/temp-db.ts`, exercises the actual repository code, then cleans up. The GitHub client is mocked (fetch-mock), the database is not. This catches schema and query bugs that a mocked DB would hide.

### E2E

E2E tests (`tests/e2e/`) use `tests/e2e/seed-db.ts` to populate a seeded SQLite DB, start a real Bun server against it, then drive the UI with Playwright — covering the full stack from HTTP route to rendered HTML.

### Git hooks (Husky)

- **pre-commit** — runs `check`, typecheck, and unit tests
- **commit-msg** — enforces [Conventional Commits](https://www.conventionalcommits.org/) via commitlint

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

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). Pre-commit hooks run lint, type check and unit tests automatically — see [Git hooks](#git-hooks-husky) above.

## License

MIT
