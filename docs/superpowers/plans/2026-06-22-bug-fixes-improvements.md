# Dashboard Bug Fixes & Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six bugs and improvements: merged-PR staleness, push-event noise/crash, responsive grid, live repo search, English translation sweep, and alignment fix.

**Architecture:** Each task is independent and testable on its own. Tasks 1–4 are pure fixes to existing files. Task 5 extends the `GitHubClient` interface with `searchRepos`, adds a new route, and wires HTMX live-search into the repo modal — all following existing patterns (fetch-mock unit tests, server-side HTML rendering).

**Tech Stack:** Bun, TypeScript strict, `bun:test`, HTMX, SQLite via `bun:sqlite`, Biome for lint/format.

## Global Constraints

- Run `bun run check` (Biome) before every commit — fix any reported issues first.
- Run `bun test tests/unit` to verify all unit tests pass before committing.
- All UI text must be English — no German strings in any template, route, or client.
- No mocking of the database in unit tests — use `createTempDbPath` from `tests/unit/helpers/temp-db.ts`.
- All new or changed functions must be `readonly`-typed and stateless (no `this`).
- Conventional Commits format: `fix(scope): message` or `feat(scope): message`.
- No `Co-Authored-By: Claude` in commits.

---

## File Map

| File | Task(s) | Change |
|---|---|---|
| `src/routes/card-route.ts` | 1, 4 | Force `prs`+`ci` hints in single-card handler; translate error string |
| `src/services/activity-service.ts` | 1, 2 | Reduce `HARD_TTL_MS`; remove push activity records |
| `src/templates/card-template.ts` | 3, 4 | Auto-fill grid; centre activity-more button; English strings |
| `src/templates/modal-template.ts` | 4, 5 | English strings; HTMX live-search attributes; `id="repo-list"` |
| `src/templates/page-template.ts` | 4 | English strings throughout |
| `src/github/github-client.ts` | 4, 5 | English error messages; add `searchRepos` method |
| `src/routes/modal-route.ts` | 5 | Add `GET /api/repos/search` route; accept `client` param |
| `src/index.ts` | 5 | Pass `client` to `createModalRoutes` |
| `tests/unit/routes/card-route.test.ts` | 1 | New test: single-card handler always passes `prs` hint |
| `tests/unit/services/activity-service.test.ts` | 2 | Update push test; add no-activity assertion |
| `tests/unit/templates/card-template.test.ts` | 3 | New test: activity-more button has `text-align:center` |
| `tests/unit/github/github-client.test.ts` | 4, 5 | Fix 3 German assertions; add `searchRepos` test; add `searchRepos` to `makeClient` |
| `tests/unit/routes/modal-route.test.ts` | 5 | New test: `GET /api/repos/search`; add `searchRepos` to `makeClient` |
| `tests/unit/services/activity-service.test.ts` | 5 | Add `searchRepos` to `makeClient` |
| `tests/unit/routes/card-route.test.ts` | 5 | Add `searchRepos` to `makeClient` |
| `tests/unit/services/card-service.test.ts` | 5 | Add `searchRepos` to `makeClient` |

---

## Task 1: Fix merged-PR staleness bug

**Problem:** When `activityService.sync` returns 304 (events cached within poll interval), `refreshNeeded` is empty → `cardService.getCard` skips `fetchSelective` → stale PR list served. This affects both auto-refresh and manual card refresh.

**Files:**
- Modify: `src/routes/card-route.ts` (single-card handler only)
- Modify: `src/services/activity-service.ts` (`HARD_TTL_MS` constant)
- Test: `tests/unit/routes/card-route.test.ts`

**Interfaces:**
- Produces: nothing new — changes behaviour of existing `GET /api/card/:owner/:repo`

- [ ] **Step 1: Write the failing test**

Add this test at the end of the `describe('card routes', ...)` block in `tests/unit/routes/card-route.test.ts`:

```typescript
test('GET /api/card/owner/repo always calls getPrs regardless of empty refreshNeeded', async () => {
  const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
  const repos = createSqliteRepos(dbPath)
  repos.cards.pin('alice/alpha')
  const getPrs = mock(async () => [])
  const client = makeClient({ getPrs })
  const service = createCardService(repos, client)
  // Activity service returns empty refreshNeeded (simulates cached events / 304)
  const activityService = makeActivityService({
    sync: mock(async () => ({ activities: [], refreshNeeded: new Set<RefreshHint>() })),
  })
  const routes = createCardRoutes(service, activityService, repos.auth, client)

  const url = new URL('http://localhost:4242/api/card/alice/alpha')
  const route = routes.find((r) => r.match(url, 'GET'))
  if (!route) throw new Error('route not found')
  await route.handle(new Request(url.href), url)

  // getPrs must be called even though refreshNeeded was empty
  expect(getPrs).toHaveBeenCalledTimes(1)

  repos.close()
  cleanupTempDir(dir)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/unit/routes/card-route.test.ts --test-name-pattern "always calls getPrs"
```

Expected: FAIL — `getPrs` called 0 times.

- [ ] **Step 3: Force `prs` + `ci` hints in the single-card handler**

In `src/routes/card-route.ts`, find the single-card handler (the one matching `/api/card/:owner/:repo`) and replace the `buildCardVm` call with an inline version that forces hints:

```typescript
// GET /api/card/:owner/:repo — single card
{
  match: (url, method) => method === 'GET' && /^\/api\/card\/[^/]+\/[^/]+$/.test(url.pathname),
  async handle(_req, url) {
    const [, , , owner, repo] = url.pathname.split('/')
    const fullName = `${owner}/${repo}`
    try {
      const syncResult = await activityService.sync(fullName)
      const hints = new Set(syncResult.refreshNeeded)
      hints.add('prs')
      hints.add('ci')
      const cardData = await cardService.getCard(fullName, hints)
      const vm = toCardViewModel(cardData, syncResult.activities)
      return html(renderCard(vm))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error loading card'
      return html(renderCardError(fullName, msg))
    }
  },
},
```

Note: `buildCardVm` is still used by the `/api/cards` (all-cards) handler — leave that unchanged. Only the single-card handler gets the forced hints.

- [ ] **Step 4: Reduce HARD_TTL from 10 min to 3 min**

In `src/services/activity-service.ts`, change:

```typescript
const HARD_TTL_MS = 10 * 60_000 // 10 minutes — force full refresh if events unseen
```

to:

```typescript
const HARD_TTL_MS = 3 * 60_000 // 3 minutes — force full refresh if events unseen
```

- [ ] **Step 5: Run all tests and verify they pass**

```bash
bun test tests/unit
```

Expected: all tests pass (207+ passing).

- [ ] **Step 6: Commit**

```bash
git add src/routes/card-route.ts src/services/activity-service.ts tests/unit/routes/card-route.test.ts
git commit -m "$(cat <<'EOF'
fix(cards): always force PR refresh on manual single-card reload

Stale PRs (e.g. merged) were served from SQLite cache when the GitHub
events feed returned 304. The single-card endpoint now forces prs+ci
hints regardless of event cache state. Reduces HARD_TTL from 10 to 3 min
so auto-refresh also converges faster.
EOF
)"
```

---

## Task 2: Filter push events from the activity strip

**Problem:** `PushEvent` payloads sometimes have `size: undefined`, producing "pushed undefined commits to main". Regardless, push-to-main events are too noisy for the activity strip.

**Fix:** Keep `hints.add('commits')` / `hints.add('ci')` (still needed for data freshness) but stop creating activity records for push events.

**Files:**
- Modify: `src/services/activity-service.ts` (`mapEvents` function)
- Test: `tests/unit/services/activity-service.test.ts`

**Interfaces:**
- No interface changes — `mapEvents` is private.

- [ ] **Step 1: Update the existing push-event test**

In `tests/unit/services/activity-service.test.ts`, find the test named `'sync maps PushEvent on main to push activity and adds commits+ci hints'` and replace it:

```typescript
test('sync emits commits+ci hints for PushEvent on main but records no activity', async () => {
  const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
  cleanup.push(dir)
  const repos = createSqliteRepos(dbPath)
  repos.activity.upsertMeta('alice/alpha', {
    eventsCachedAt: new Date(Date.now() - 120_000),
    pollIntervalSecs: 60,
    dependabotCachedAt: new Date(),
  })
  const getRepoEvents = mock(async () => ({
    events: [
      {
        id: 'evt_003',
        type: 'PushEvent',
        actor: { login: 'alice' },
        payload: { ref: 'refs/heads/main', size: 3, before: 'abc', head: 'def' },
        repo: { name: 'alice/alpha' },
        createdAt: '2026-06-20T12:00:00Z',
      },
    ],
    etag: '"e3"',
    pollIntervalSecs: 60,
  }))
  const service = createActivityService(repos, makeClient({ getRepoEvents }))

  const result = await service.sync('alice/alpha')

  expect(result.refreshNeeded.has('commits')).toBe(true)
  expect(result.refreshNeeded.has('ci')).toBe(true)
  // No activity record — push events are suppressed from the strip
  expect(result.activities).toHaveLength(0)

  repos.close()
  cleanupTempDir(dir)
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test tests/unit/services/activity-service.test.ts --test-name-pattern "emits commits\+ci hints"
```

Expected: FAIL — `activities` has length 1 (the push record is still there).

- [ ] **Step 3: Remove push activity record creation in `mapEvents`**

In `src/services/activity-service.ts`, find the `PushEvent` branch in `mapEvents` and replace it:

```typescript
} else if (event.type === 'PushEvent') {
  const p = event.payload as { ref: string; before: string; head: string }
  const branch = p.ref.replace('refs/heads/', '')
  if (branch !== 'main' && branch !== 'master') continue
  hints.add('commits')
  hints.add('ci')
  // push events not recorded — too noisy for the activity strip
}
```

- [ ] **Step 4: Run all unit tests**

```bash
bun test tests/unit
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/activity-service.ts tests/unit/services/activity-service.test.ts
git commit -m "$(cat <<'EOF'
fix(activity): suppress push-to-main events from activity strip

Push events with size:undefined crashed the display. Beyond that, push
notifications are too noisy. Hints (commits, ci) are still emitted so
commit date and CI status continue to refresh correctly.
EOF
)"
```

---

## Task 3: Responsive grid + activity-button alignment

**Files:**
- Modify: `src/templates/card-template.ts`
- Test: `tests/unit/templates/card-template.test.ts`

**Interfaces:**
- No interface changes.

- [ ] **Step 1: Write failing tests**

Add these two tests to the `describe` block in `tests/unit/templates/card-template.test.ts`:

```typescript
test('renderCards uses auto-fill grid', () => {
  const vm = toCardViewModel(emptyCardData('alice/alpha'), [])
  const html = renderCards([vm])
  expect(html).toContain('repeat(auto-fill,minmax(340px,1fr))')
})

test('activity more button is centred', () => {
  const data: CardData = {
    ...emptyCardData('alice/alpha'),
    cache: { ...emptyCardData('alice/alpha').cache, prTotal: 0 },
  }
  // 6 activities so activityMore > 0
  const activities: Activity[] = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    repoFullName: 'alice/alpha',
    eventType: 'pr_merged' as const,
    actor: '@bob',
    subject: `merged #${i + 1}`,
    linkUrl: `https://github.com/alice/alpha/pull/${i + 1}`,
    occurredAt: new Date(),
    recordedAt: new Date(),
    githubEventId: `evt_${i + 1}`,
  }))
  const vm = toCardViewModel(data, activities)
  const html = renderCard(vm)
  expect(html).toContain('text-align:center')
})
```

Also add the missing import at the top of the test file (after checking — `Activity` type is already imported from `src/db/types.ts` if it exists; add it if not):

```typescript
import type { Activity } from '../../../src/db/types.ts'
```

- [ ] **Step 2: Run the failing tests**

```bash
bun test tests/unit/templates/card-template.test.ts --test-name-pattern "auto-fill|centred"
```

Expected: both FAIL.

- [ ] **Step 3: Fix the grid in `renderCards`**

In `src/templates/card-template.ts`, in the `renderCards` function, change:

```typescript
  return `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">
```

to:

```typescript
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px">
```

- [ ] **Step 4: Centre the activity-more button**

In `src/templates/card-template.ts`, in `renderCard`, find the activity-more button (search for `· ${vm.activityMore} more activities`) and change its style from `text-align:left` to `text-align:center;width:100%`:

```typescript
      <button hx-get="/api/activity/${safeOwner}/${safeName}"
              hx-target="#modal" hx-swap="innerHTML"
              style="font-size:10px;color:#2f81f7;padding:2px 0;text-align:center;width:100%;background:transparent;border:none;cursor:pointer;font-family:inherit">
        · ${vm.activityMore} more activities
      </button>
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/unit/templates/card-template.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/templates/card-template.ts tests/unit/templates/card-template.test.ts
git commit -m "$(cat <<'EOF'
fix(ui): responsive grid and centre activity-more button

Grid switches from hardcoded 3 cols to auto-fill (340 px min), giving 4+
cols on widescreen. Activity strip overflow button now matches the PR
more-button alignment (centred, full width).
EOF
)"
```

---

## Task 4: English translation sweep

Replace all German user-visible strings across templates, routes, and the GitHub client. Also fix the three existing unit-test assertions that check for German error strings.

**Files:**
- Modify: `src/templates/card-template.ts`
- Modify: `src/templates/modal-template.ts`
- Modify: `src/templates/page-template.ts`
- Modify: `src/routes/card-route.ts`
- Modify: `src/github/github-client.ts`
- Test: `tests/unit/github/github-client.test.ts` (fix 3 assertions)

**Interfaces:**
- No interface changes — only string literals change.

- [ ] **Step 1: Fix the three test assertions that check German error messages**

These tests currently pass because the code has German strings — changing the code will break them. Update them **before** changing the source so you can run the test suite as a regression check after.

In `tests/unit/github/github-client.test.ts`:

Find the test `'gfetch throws on 401 response'` (line ~549) and change the assertion:
```typescript
await expect(client.getUser()).rejects.toThrow('Invalid token (401)')
```

Find the test `'gfetch throws with fallback message on 403 when body has no message field'` (line ~583) and change the assertion:
```typescript
await expect(client.getUser()).rejects.toThrow('Access denied (403)')
```

Find the test `'gfetch throws with fallback status message on non-ok response with no body message'` (line ~623) and change the assertion:
```typescript
await expect(client.getUser()).rejects.toThrow('API error 500')
```

- [ ] **Step 2: Run the client tests to confirm they now fail (proving the code still has German)**

```bash
bun test tests/unit/github/github-client.test.ts --test-name-pattern "401|fallback message on 403|fallback status"
```

Expected: 3 FAIL (the assertions don't match German strings yet).

- [ ] **Step 3: Translate error strings in `src/github/github-client.ts`**

In `createGitHubClient`, change the three hard-coded German error strings:

```typescript
// In getUser:
if (res.status === 401) throw new Error('Invalid token (401)')
// ...
throw new Error(j.message ?? 'Access denied (403)')
// ...
throw new Error(j.message ?? `API error ${res.status}`)
```

In `gfetch` (the inner helper used by most methods):
```typescript
if (res.status === 401) throw new Error('Invalid token (401)')
// ...
throw new Error(j.message ?? 'Access denied (403)')
// ...
throw new Error(j.message ?? `API error ${res.status}`)
```

- [ ] **Step 4: Run the client tests — they should now pass**

```bash
bun test tests/unit/github/github-client.test.ts
```

Expected: all pass.

- [ ] **Step 5: Translate German strings in `src/templates/card-template.ts`**

Make these replacements (use editor search-and-replace — exact strings):

| Find | Replace |
|---|---|
| `'Keine Dependabot-Alerts'` | `'No Dependabot alerts'` |
| `'+ 1 weiterer PR'` | `'+ 1 more PR'` |
| `` `+ ${prMore} weitere PRs` `` | `` `+ ${prMore} more PRs` `` |
| `'✓ Keine offenen PRs'` | `'✓ No open PRs'` |
| `'Noch keine Repos gepinnt'` | `'No repos pinned yet'` |
| `'Klicke auf "Repo hinzufügen" um loszulegen.'` | `'Click "+ Add repo" to get started.'` |
| `title="Neu laden"` | `title="Refresh"` |
| `title="Entfernen"` | `title="Remove"` |

- [ ] **Step 6: Translate German strings in `src/templates/modal-template.ts`**

| Find | Replace |
|---|---|
| `'Repos verwalten'` | `'Manage repos'` |
| `placeholder="Repo suchen…"` | `placeholder="Search repos…"` |
| `'Privat'` (the badge text) | `'Private'` |

- [ ] **Step 7: Translate German strings in `src/templates/page-template.ts`**

| Find | Replace |
|---|---|
| `'Aktualisieren'` | `'Refresh'` |
| `'Abmelden'` | `'Sign out'` |
| `'+ Repo hinzufügen'` | `'+ Add repo'` |
| `'Verbinde…'` | `'Connecting…'` |
| `'Mit GitHub verbinden'` | `'Connect to GitHub'` |
| `'Dein Token wird nur lokal auf diesem Gerät gespeichert.'` | `'Your token is stored locally on this device only.'` |
| `'Benötigte Scopes:'` | `'Required scopes:'` |
| `title="Neu laden"` (refresh button if present) | `title="Refresh"` |
| `lang="de"` (in `<html>` tag, appears twice) | `lang="en"` |

- [ ] **Step 8: Run `bun run check` (Biome) and fix any issues**

```bash
bun run check
```

Expected: `No fixes applied.` If there are warnings, run `bun run check:fix` and re-check.

- [ ] **Step 9: Run all unit tests**

```bash
bun test tests/unit
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/templates/card-template.ts src/templates/modal-template.ts src/templates/page-template.ts src/routes/card-route.ts src/github/github-client.ts tests/unit/github/github-client.test.ts
git commit -m "$(cat <<'EOF'
fix(i18n): translate all German UI strings to English

Covers card template, modal template, page template, card route error
message, and GitHub client error messages. Updates three unit tests that
asserted on German error strings. Sets html lang="en".
EOF
)"
```

---

## Task 5: Live repo search

Add `searchRepos` to the `GitHubClient` interface, a new `GET /api/repos/search` route, and HTMX live-search to the repo modal input. When query is < 2 chars the endpoint returns the default recently-updated repos; when ≥ 2 chars it calls the GitHub Search API.

**Files:**
- Modify: `src/github/github-client.ts` — add `searchRepos`
- Modify: `src/routes/modal-route.ts` — new route + `client` param
- Modify: `src/templates/modal-template.ts` — HTMX attrs + `id="repo-list"`
- Modify: `src/index.ts` — pass `client` to `createModalRoutes`
- Modify: `tests/unit/github/github-client.test.ts` — add `searchRepos` to `makeClient` + new test
- Modify: `tests/unit/routes/modal-route.test.ts` — add `searchRepos` to `makeClient` + new tests
- Modify: `tests/unit/services/activity-service.test.ts` — add `searchRepos` to `makeClient`
- Modify: `tests/unit/routes/card-route.test.ts` — add `searchRepos` to `makeClient`
- Modify: `tests/unit/services/card-service.test.ts` — add `searchRepos` to `makeClient`

**Interfaces:**
- Produces: `searchRepos(q: string): Promise<GitHubRepo[]>` on `GitHubClient`
- Produces: `createModalRoutes(cardService, cardRepo, client)` — new third param

- [ ] **Step 1: Add `searchRepos` to the `GitHubClient` interface**

In `src/github/github-client.ts`, add the method signature to the `GitHubClient` interface:

```typescript
export interface GitHubClient {
  getUser(): Promise<GitHubUser>
  getRepos(): Promise<GitHubRepo[]>
  searchRepos(q: string): Promise<GitHubRepo[]>
  getPrs(fullName: string): Promise<GitHubPr[]>
  getLastCommitDate(fullName: string): Promise<Date | null>
  getCiStatus(fullName: string, sha: string): Promise<CiStatus>
  getRepoEvents(fullName: string, etag?: string): Promise<RepoEventsResult>
  getDependabotAlerts(fullName: string): Promise<GitHubDependabotAlert[]>
}
```

Then add the implementation inside `createGitHubClient`, after the `getRepos` method:

```typescript
async searchRepos(q) {
  const data = (await gfetch(
    `/search/repositories?q=${encodeURIComponent(q)}&sort=updated&per_page=30`,
  )) as {
    items: Array<{
      full_name: string
      name: string
      owner: { login: string }
      private: boolean
      language: string | null
      stargazers_count: number
      updated_at: string
    }>
  }
  return data.items.map((r) => ({
    fullName: r.full_name,
    name: r.name,
    owner: r.owner.login,
    isPrivate: r.private,
    language: r.language,
    stargazersCount: r.stargazers_count,
    updatedAt: r.updated_at,
  }))
},
```

- [ ] **Step 2: Add `searchRepos` to every `makeClient` helper in tests**

TypeScript will complain that `makeClient` returns an incomplete `GitHubClient`. Add `searchRepos: mock(async () => [])` to each `makeClient` helper in:

- `tests/unit/github/github-client.test.ts`
- `tests/unit/routes/card-route.test.ts`
- `tests/unit/routes/modal-route.test.ts`
- `tests/unit/services/activity-service.test.ts`
- `tests/unit/services/card-service.test.ts`

In each file, find the `makeClient` function and add the line:

```typescript
searchRepos: mock(async () => []),
```

after `getRepos: mock(async () => []),`.

- [ ] **Step 3: Write the `searchRepos` unit test**

Add to `tests/unit/github/github-client.test.ts`:

```typescript
test('searchRepos maps GitHub Search API items to GitHubRepo', async () => {
  const { dir, dbPath } = createTempDbPath('gh-dash-client-')
  const repos = createSqliteRepos(dbPath)
  repos.auth.saveToken({ pat: 'ghp_test', username: 'alice', avatarUrl: '', expiresAt: null })

  const fetchFn = makeJsonFetch({
    '/search/repositories': {
      total_count: 1,
      items: [
        {
          full_name: 'jtl-software/old-repo',
          name: 'old-repo',
          owner: { login: 'jtl-software' },
          private: true,
          language: 'Go',
          stargazers_count: 5,
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
    },
  })
  const client = createGitHubClient(repos.auth, fetchFn)

  const result = await client.searchRepos('old')

  expect(result).toHaveLength(1)
  expect(result[0]).toEqual({
    fullName: 'jtl-software/old-repo',
    name: 'old-repo',
    owner: 'jtl-software',
    isPrivate: true,
    language: 'Go',
    stargazersCount: 5,
    updatedAt: '2024-01-01T00:00:00Z',
  })

  repos.close()
  cleanupTempDir(dir)
})
```

- [ ] **Step 4: Run the new test to verify it fails (interface added but impl not yet)**

Wait — we added the implementation in Step 1. Run to confirm it passes:

```bash
bun test tests/unit/github/github-client.test.ts --test-name-pattern "searchRepos"
```

Expected: PASS. If it fails, check the `makeJsonFetch` key matches `/search/repositories` exactly (the helper does `path.startsWith(key)` so `/search/repositories?q=...` will match `/search/repositories`).

- [ ] **Step 5: Export `renderRepoRow` and `toRepoListItem` from `modal-template.ts`**

In `src/templates/modal-template.ts`, `renderRepoRow` and `toRepoListItem` are currently not exported. Change their declarations:

```typescript
export function toRepoListItem(repo: GitHubRepo, isPinned: boolean): RepoListItemViewModel {
```

```typescript
export function renderRepoRow(vm: RepoListItemViewModel): string {
```

- [ ] **Step 6: Add `client` param to `createModalRoutes` and add the search route**

Replace the entire contents of `src/routes/modal-route.ts`:

```typescript
import type { CardRepo } from '../db/cards/card-repo.ts'
import type { GitHubClient } from '../github/github-client.ts'
import type { CardService } from '../services/card-service.ts'
import { renderRepoModal, renderRepoRow, toRepoListItem } from '../templates/modal-template.ts'
import { html } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

export function createModalRoutes(
  cardService: CardService,
  cardRepo: CardRepo,
  client: GitHubClient,
): RouteHandler[] {
  return [
    {
      match: (url, method) => url.pathname === '/api/modal/repos' && method === 'GET',
      async handle() {
        const repos = await cardService.getAllRepos()
        const pinned = new Set(cardRepo.getPinned().map((r) => r.fullName))
        return html(renderRepoModal(repos, pinned))
      },
    },
    {
      match: (url, method) => url.pathname === '/api/repos/search' && method === 'GET',
      async handle(_req, url) {
        const q = url.searchParams.get('q')?.trim() ?? ''
        const pinned = new Set(cardRepo.getPinned().map((r) => r.fullName))
        const repos =
          q.length >= 2 ? await client.searchRepos(q) : await cardService.getAllRepos()
        return html(repos.map((r) => renderRepoRow(toRepoListItem(r, pinned.has(r.fullName)))).join(''))
      },
    },
  ]
}
```

- [ ] **Step 7: Add HTMX live-search to the modal input and `id` to the list**

In `src/templates/modal-template.ts`, replace the `renderRepoModal` function:

```typescript
export function renderRepoModal(repos: GitHubRepo[], pinned: Set<string>): string {
  const items = repos.map((r) => toRepoListItem(r, pinned.has(r.fullName)))
  return `
<div class="modal-overlay" onclick="if(event.target===this)document.getElementById('modal').innerHTML=''">
  <div class="modal" onclick="event.stopPropagation()">
    <div style="padding:15px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:15px;font-weight:600;flex:1">Manage repos</span>
      <button onclick="document.getElementById('modal').innerHTML=''"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    <div style="padding:10px 14px;border-bottom:1px solid #21262d">
      <input id="repo-search" name="q" type="text" placeholder="Search repos…"
             hx-get="/api/repos/search"
             hx-target="#repo-list"
             hx-swap="innerHTML"
             hx-trigger="input changed delay:300ms"
             style="width:100%;background:#0d1117;border:1px solid #30363d;border-radius:6px;
                    padding:7px 11px;color:#e6edf3;font-size:13px;outline:none"/>
    </div>
    <div id="repo-list" style="overflow-y:auto;flex:1">
      ${items.map(renderRepoRow).join('')}
    </div>
  </div>
</div>`
}
```

Note: the old client-side JS filter in `page-template.ts` listens for `input` on `#repo-search` and filters `[data-repo-name]` elements. Once HTMX takes over the input event, the JS filter will also fire but will only filter the currently-rendered rows (a harmless no-op when the list is replaced by HTMX). No change is needed in the JS.

- [ ] **Step 8: Wire the new `client` param into `index.ts`**

In `src/index.ts`, find the line:

```typescript
  ...createModalRoutes(cardService, repos.cards),
```

Replace with:

```typescript
  ...createModalRoutes(cardService, repos.cards, client),
```

- [ ] **Step 9: Write the modal route tests**

In `tests/unit/routes/modal-route.test.ts`, update the `makeClient` helper (Step 2 already did this). Then update the `createModalRoutes` calls to pass a `client` argument — all existing calls need the third arg:

Find every `createModalRoutes(service, repos.cards)` in the test file and change to:
```typescript
createModalRoutes(service, repos.cards, makeClient())
```

Then add these two new tests:

```typescript
test('GET /api/repos/search with q>=2 calls searchRepos and returns HTML rows', async () => {
  const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
  const repos = createSqliteRepos(dbPath)
  const searchRepos = mock(async () => [makeRepo('jtl-software/old-archive')])
  const service = createCardService(repos, makeClient())
  const routes = createModalRoutes(service, repos.cards, makeClient({ searchRepos }))

  const url = new URL('http://localhost:4242/api/repos/search?q=old')
  const route = routes.find((r) => r.match(url, 'GET'))
  if (!route) throw new Error('route not found')
  const res = await route.handle(new Request(url.href), url)
  const body = await res.text()

  expect(res.status).toBe(200)
  expect(searchRepos).toHaveBeenCalledWith('old')
  expect(body).toContain('jtl-software/old-archive')

  repos.close()
  cleanupTempDir(dir)
})

test('GET /api/repos/search with q<2 falls back to getAllRepos', async () => {
  const { dir, dbPath } = createTempDbPath('gh-dash-modal-route-')
  const repos = createSqliteRepos(dbPath)
  const getRepos = mock(async () => [makeRepo('alice/alpha')])
  const searchRepos = mock(async () => [])
  const service = createCardService(repos, makeClient({ getRepos }))
  const routes = createModalRoutes(service, repos.cards, makeClient({ searchRepos }))

  const url = new URL('http://localhost:4242/api/repos/search?q=a')
  const route = routes.find((r) => r.match(url, 'GET'))
  if (!route) throw new Error('route not found')
  const res = await route.handle(new Request(url.href), url)
  const body = await res.text()

  expect(res.status).toBe(200)
  expect(searchRepos).not.toHaveBeenCalled()
  expect(body).toContain('alice/alpha')

  repos.close()
  cleanupTempDir(dir)
})
```

- [ ] **Step 10: Run all unit tests**

```bash
bun run check && bun test tests/unit
```

Expected: all tests pass, Biome reports no issues.

- [ ] **Step 11: Commit**

```bash
git add src/github/github-client.ts src/routes/modal-route.ts src/templates/modal-template.ts src/index.ts tests/unit/github/github-client.test.ts tests/unit/routes/modal-route.test.ts tests/unit/routes/card-route.test.ts tests/unit/services/activity-service.test.ts tests/unit/services/card-service.test.ts
git commit -m "$(cat <<'EOF'
feat(repos): live API search in repo picker modal

Adds searchRepos() to GitHubClient (GitHub Search API, per_page=30).
New GET /api/repos/search route falls back to top-100 recently-updated
repos when query is empty or < 2 chars. HTMX live-search on the modal
input with 300 ms debounce replaces the static client-side filter.
Removes the 100-row cap so all fetched repos are shown initially.
EOF
)"
```
