# PAT Expiry Warning — Design Spec

**Date:** 2026-06-21
**Status:** Approved

## Context

GitHub Personal Access Tokens (PATs) can have an expiration date. Fine-grained PATs always
have one; classic PATs optionally do. When a PAT expires, all dashboard API calls silently
break until the user re-enters a new token. The goal is to surface the expiry date proactively
so the user can act before the token goes stale — without requiring manual re-authentication
for existing users (Approach B: lazy backfill).

## Severity Bands

A pure function derives severity from `expiresAt`:

| Remaining time | Severity | Icon color |
|---|---|---|
| > 21 days | `info` | `#388bfd` (blue) |
| 4–21 days | `notice` | `#d29922` (amber) |
| ≤ 3 days | `warning` | `#f85149` (red) |
| `null` (no expiry or unknown) | none — icon hidden | — |

## Data Layer

**No schema migration needed.** The settings table is a KV store; a new key
`pat_expires_at` is added alongside `pat`, `username`, `avatar_url`.

- Value is an ISO 8601 string (`"2026-12-31T21:01:12.000Z"`) or absent when unknown.
- `getToken()` returns `expiresAt: null` if the key is missing (existing users before upgrade).
- `deleteToken()` also deletes `pat_expires_at`.

### AuthToken type (`src/db/types.ts`)

```typescript
type AuthToken = {
  readonly pat: string
  readonly username: string
  readonly avatarUrl: string
  readonly expiresAt: Date | null   // NEW
}
```

### AuthRepo (`src/db/auth/auth-repo.ts` + `sqlite-auth-repo.ts`)

`getToken`, `saveToken`, `deleteToken` all handle the new field. Parsing: read the ISO
string from SQLite, convert to `new Date(value)`, return `null` if key absent or value empty.

## GitHub Client (`src/github/github-client.ts`)

`getUser()` reads the `GitHub-Authentication-Token-Expiration` response header
(format: `"2021-03-31 21:01:12 UTC"`, only present when the token has an expiry).

Return type becomes:
```typescript
interface GitHubUser {
  login: string
  avatarUrl: string
  expiresAt: Date | null   // NEW
}
```

Parsing: `new Date(headerValue)` — the format is directly parseable by `Date`. Returns `null`
if header absent.

No other GitHub client methods change. The header is only read in `getUser()`.

## Auth Route (`src/routes/auth-route.ts`)

On `POST /api/auth` (PAT setup and renewal), after `client.getUser()` returns:
- `authRepo.saveToken({ pat, username, avatarUrl, expiresAt })` — now includes `expiresAt`.

On `POST /api/auth` with `HX-Request` header present (modal renewal form):
- Return `HX-Redirect: /` instead of a plain redirect, so the modal form works inline.

## Card Route — Backfill (`src/routes/card-route.ts`)

On `GET /`, after `authRepo.getToken()`:
```
if token.expiresAt === null:
  user = await client.getUser()
  authRepo.saveToken({ ...token, username: user.login, avatarUrl: user.avatarUrl, expiresAt: user.expiresAt })
  token = { ...token, expiresAt: user.expiresAt }
```

This fires at most once per user — on the first dashboard load after upgrade. After that
`expiresAt` is populated and the branch is skipped.

## Severity Service (`src/services/pat-expiry-service.ts`)

New file with a single pure function:

```typescript
type PatExpirySeverity = 'info' | 'notice' | 'warning'

function getPatExpirySeverity(expiresAt: Date, now: Date): PatExpirySeverity | null {
  const days = (expiresAt.getTime() - now.getTime()) / 86_400_000
  if (days <= 0) return 'warning'   // already expired
  if (days <= 3) return 'warning'
  if (days <= 21) return 'notice'
  return 'info'
}
```

`now` is injected so the function is pure and trivially testable.

## Templates

### `renderDashboard()` (`src/templates/page-template.ts`)

New optional params: `expiresAt: Date | null`, `severity: PatExpirySeverity | null`.

**Header icon** (rendered next to avatar when `severity !== null`):
- SVG clock or shield icon, colored by severity
- `title="Token expires in X days (YYYY-MM-DD)"` for native tooltip
- `onclick="openPatModal()"` to open the renewal modal

**Renewal modal** (hidden, rendered inline in the page):
- Header: "Personal Access Token"
- Status line: "Your token expires on YYYY-MM-DD (in X days)" styled with severity color
- Link: `<a href="https://github.com/settings/tokens" target="_blank">Create a new token on GitHub →</a>`
- Form: PAT `<input>` + "Renew Token" button, `hx-post="/api/auth"`, `hx-target="body"`,
  responds to `HX-Redirect` header

### Modal open/close

A small `<script>` block (same pattern as existing drag-and-drop JS) handles `openPatModal()` /
`closePatModal()` by toggling `display` on the overlay div.

## File Change Summary

| File | Change |
|---|---|
| `src/db/types.ts` | Add `expiresAt: Date \| null` to `AuthToken` |
| `src/db/auth/auth-repo.ts` | No interface change needed (AuthToken already covers it) |
| `src/db/auth/sqlite-auth-repo.ts` | Read/write/delete `pat_expires_at` key |
| `src/github/github-client.ts` | `getUser()` reads expiry header, returns `GitHubUser.expiresAt` |
| `src/routes/auth-route.ts` | Pass `expiresAt` to `saveToken`; support `HX-Redirect` on modal submit |
| `src/routes/card-route.ts` | Backfill logic; compute severity; pass to `renderDashboard` |
| `src/services/pat-expiry-service.ts` | **NEW** — pure `getPatExpirySeverity(expiresAt, now)` |
| `src/templates/page-template.ts` | Icon next to avatar; renewal modal HTML |
| `docs/migration-checklist.md` | Mark items done as implemented |

## Tests

### Unit

| Test file | What to cover |
|---|---|
| `tests/unit/github/github-client.test.ts` | `getUser()` parses header → `Date`; returns `null` when header absent; handles already-expired token |
| `tests/unit/db/auth/sqlite-auth-repo.test.ts` | `saveToken`/`getToken` round-trips `expiresAt`; `getToken` returns `null` for tokens without the key |
| `tests/unit/services/pat-expiry-service.test.ts` | **NEW** — all severity thresholds; `null` input; already-expired; boundary values |
| `tests/unit/templates/page-template.test.ts` | Icon rendered per severity; no icon when `null`; tooltip text format |
| `tests/unit/routes/card-route.test.ts` | Backfill fires when `expiresAt === null`; skipped when already set |
| `tests/unit/routes/auth-route.test.ts` | `saveToken` called with `expiresAt`; `HX-Redirect` returned for HTMX requests |

### E2E

- `tests/e2e/seed-db.ts` — add `patExpiresAt` option to seed function
- `tests/e2e/dashboard.spec.ts` — icon visible at correct severity for each seeded date;
  click opens modal; form submit with new PAT succeeds and page updates; no icon when expiry null

## Verification

```bash
bun test tests/unit              # all unit tests pass
bun run test:e2e                 # e2e: icon, modal, renewal flow
bun run check                    # Biome lint + format clean
bun x tsc --noEmit               # no type errors
```

Manual: start `bun run dev`, seed a DB with an expiry 2 days out, verify warning icon,
hover tooltip, click → modal, enter new PAT, submit → page reloads with updated severity.
