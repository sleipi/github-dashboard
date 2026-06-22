# Design: Dashboard Bug Fixes & Improvements

**Date:** 2026-06-22
**Status:** Approved

## Overview

Six independent improvements to the GitHub Dashboard: one PR-list staleness bug, one push-event noise/crash bug, a responsive grid layout, a live repo search, a full English translation sweep, and an alignment fix.

---

## 1. Merged PRs Not Disappearing (Bug Fix)

### Problem

When the card single-refresh endpoint (`GET /api/card/:owner/:repo`) is called, `activityService.sync` may return an empty `refreshNeeded` set if the GitHub events feed was recently cached (304 Not Modified, within the 60 s poll interval). `cardService.getCard` then skips `fetchSelective` entirely (`needsFetch = !cached || refreshNeeded.size > 0` evaluates to `false`), serving stale PR data from SQLite. The merged PR remains visible indefinitely — even after the user clicks the manual ↻ refresh button.

The auto-refresh path (every 10 s, `GET /api/cards`) has the same blind spot: if a PR was merged between event polls, the closed event may already be cached (ETag 304 on subsequent requests), so `prs` is never added to hints. The existing `HARD_TTL_MS = 10 min` backstop is too long.

### Fix

**Manual card refresh** (`card-route.ts`, single-card handler): after obtaining `syncResult`, always force `prs` and `ci` into the hint set before calling `getCard`. The auto-refresh path (`/api/cards`) stays event-driven to avoid unnecessary API calls.

```typescript
// GET /api/card/:owner/:repo
const syncResult = await activityService.sync(fullName)
const hints = new Set(syncResult.refreshNeeded)
hints.add('prs')
hints.add('ci')
const cardData = await cardService.getCard(fullName, hints)
```

**Reduced HARD_TTL** (`activity-service.ts`): lower `HARD_TTL_MS` from `10 * 60_000` (10 min) to `3 * 60_000` (3 min) so auto-refresh also converges within a reasonable window.

### Scope

- `src/routes/card-route.ts` — single-card handler only
- `src/services/activity-service.ts` — `HARD_TTL_MS` constant

---

## 2. Push Events Filtered from Activity Strip (Bug Fix + UX)

### Problem

`PushEvent` entries in the GitHub events feed sometimes have `payload.size` as `undefined`, producing "X pushed undefined commits to main" in the activity strip. Beyond the crash-text, push-to-main notifications are too noisy to be useful in a dashboard context.

### Fix

In `mapEvents` (`activity-service.ts`): **remove the activity record creation** for `PushEvent`. Keep the hint emissions (`hints.add('commits')` and `hints.add('ci')`) — they are still needed to trigger commit-date and CI-status refreshes. Only the visible activity entry is suppressed.

```typescript
} else if (event.type === 'PushEvent') {
  const p = event.payload as { ref: string }
  const branch = p.ref.replace('refs/heads/', '')
  if (branch !== 'main' && branch !== 'master') continue
  hints.add('commits')
  hints.add('ci')
  // No activity record — push events are too noisy for the strip
}
```

### Scope

- `src/services/activity-service.ts` — `mapEvents` function

---

## 3. Responsive Widescreen Grid

### Problem

The card grid uses `repeat(3,minmax(0,1fr))`, hardcoding three columns regardless of viewport width. On widescreen monitors (≥1400 px) four cards would fit comfortably.

### Fix

Replace the hardcoded column count with an `auto-fill` track:

```
repeat(auto-fill, minmax(340px, 1fr))
```

This yields 1 column on narrow viewports, 2 on laptop, 3 on standard desktop, and 4+ on widescreen — no media queries needed.

### Scope

- `src/templates/card-template.ts` — `renderCards` function

---

## 4. Live Repo Search (Feature)

### Problem

The repo-picker modal fetches up to 300 repos (`/user/repos`, 3 pages × 100) sorted by last-updated, then hard-caps the rendered list at 100 rows. Repos that have not been touched recently are invisible to the search. Client-side JS filtering only works over the rendered rows.

### Design

**Initial load**: fetch the first page (100 repos, `sort=updated`) from `/user/repos`. Remove the `slice(0, 100)` cap in `renderRepoModal` — show all 100. The existing client-side filter continues to work over these rows as a fast pre-filter.

**Live search** (≥2 chars, debounced 300 ms via HTMX): the search input calls `GET /api/repos/search?q={query}`. The server calls the GitHub Search API and returns rendered repo rows. The rendered list inside the modal is replaced via `hx-swap="innerHTML"`.

**Empty / short query**: when `q` is blank or < 2 chars the server falls back to the same initial 100 recently-updated repos (no extra GitHub API call).

### New pieces

| Piece | Location |
|---|---|
| `searchRepos(q: string): Promise<GitHubRepo[]>` | `src/github/github-client.ts` |
| `GET /api/repos/search` route | `src/routes/modal-route.ts` |
| HTMX attributes on search input | `src/templates/modal-template.ts` |
| Separate `id="repo-list"` target div | `src/templates/modal-template.ts` |

**GitHub Search API call** (authenticated, uses existing PAT):
```
GET /search/repositories?q={query}&sort=updated&per_page=30
```
The authenticated PAT ensures private org repos the user has access to are included in results.

**Rate limit note**: GitHub Search API allows 30 requests/min for authenticated users. The 300 ms debounce keeps usage well within this limit for normal typing.

### Scope

- `src/github/github-client.ts` — add `searchRepos`
- `src/routes/modal-route.ts` — add `/api/repos/search` handler
- `src/templates/modal-template.ts` — search input gets HTMX attrs, list gets `id`

---

## 5. Full English Translation

### Problem

German strings are scattered across templates, route handlers, and the GitHub client. Mixed languages degrade readability and break the convention that all code and UI text is English.

### Affected strings

| File | German | English replacement |
|---|---|---|
| `card-template.ts` | `'Keine Dependabot-Alerts'` | `'No Dependabot alerts'` |
| `card-template.ts` | `'+ 1 weiterer PR'` | `'+ 1 more PR'` |
| `card-template.ts` | `'+ ${n} weitere PRs'` | `'+ ${n} more PRs'` |
| `card-template.ts` | `'✓ Keine offenen PRs'` | `'✓ No open PRs'` |
| `card-template.ts` | `'Noch keine Repos gepinnt'` | `'No repos pinned yet'` |
| `card-template.ts` | `'Klicke auf "Repo hinzufügen"…'` | `'Click "+ Add repo" to get started.'` |
| `card-template.ts` | title `'Neu laden'` | `'Refresh'` |
| `card-template.ts` | title `'Entfernen'` | `'Remove'` |
| `card-route.ts` | `'Fehler beim Laden'` | `'Error loading card'` |
| `modal-template.ts` | `'Repos verwalten'` | `'Manage repos'` |
| `modal-template.ts` | `'Repo suchen…'` | `'Search repos…'` |
| `modal-template.ts` | `'Privat'` badge | `'Private'` |
| `page-template.ts` | `'Aktualisieren'` button | `'Refresh'` |
| `page-template.ts` | `'Abmelden'` button | `'Sign out'` |
| `page-template.ts` | `'+ Repo hinzufügen'` button | `'+ Add repo'` |
| `page-template.ts` | `'Verbinde…'` | `'Connecting…'` |
| `page-template.ts` | `'Mit GitHub verbinden'` | `'Connect to GitHub'` |
| `page-template.ts` | `'Dein Token wird nur lokal…'` | `'Your token is stored locally on this device only.'` |
| `page-template.ts` | `'Benötigte Scopes:'` | `'Required scopes:'` |
| `page-template.ts` | `'Noch keine Repos gepinnt'` (empty state) | `'No repos pinned yet'` |
| `github-client.ts` | `'Token ungültig (401)'` | `'Invalid token (401)'` |
| `github-client.ts` | `'Zugriff verweigert (403)'` | `'Access denied (403)'` |
| `github-client.ts` | `'API-Fehler'` | `'API error'` |

### Scope

- `src/templates/card-template.ts`
- `src/templates/modal-template.ts`
- `src/templates/page-template.ts`
- `src/routes/card-route.ts`
- `src/github/github-client.ts`

---

## 6. Consistent Alignment on "More" Buttons

### Problem

The activity "more activities" button uses `text-align:left`, while the PR "more PRs" button uses `text-align:center; width:100%`. Both should be centered.

### Fix

Add `width:100%;text-align:center` to the activity "more" button in `renderCard`.

### Scope

- `src/templates/card-template.ts` — activity "more" button style

---

## Testing

Each fix has a corresponding test requirement:

| Fix | Test type | What to cover |
|---|---|---|
| Merged PR staleness | Unit | `getCard` with empty `refreshNeeded` does NOT call `fetchSelective`; single-card route always passes `prs` hint |
| Push event filter | Unit | `mapEvents` with `PushEvent` emits hints but no activity records |
| Responsive grid | E2E or visual | Grid renders correct column count at various viewport widths |
| Live repo search | Unit + E2E | `searchRepos` returns mapped repos; route returns rendered rows; HTMX triggers on input |
| English text | Unit | Spot-check key strings in rendered output |
| Alignment | E2E or visual | "more" buttons both have `text-align:center` |

All unit tests use real SQLite (`createTempDbPath`). GitHub client is mocked via fetch-mock in service/route tests.
