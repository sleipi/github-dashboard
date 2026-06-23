# Browser Tab Notifications + PR Open Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a favicon badge and title prefix `(N)` on the browser tab when new activity events arrive, and track PR open events alongside existing close/merge events.

**Architecture:** The existing HTMX 10s card poll (`GET /api/cards`) carries a client-supplied `X-Last-Seen-Event-At` timestamp header. The server counts activity rows newer than that timestamp; if any exist, it adds `HX-Trigger: {"newEvents":{"count":N}}` to the response. Client JS listens for the event and draws a red canvas dot on the favicon while prefixing the title — both reset on tab focus.

**Tech Stack:** Bun, TypeScript (strict), SQLite via `bun:sqlite`, HTMX, vanilla JS, Bun test, Playwright

## Global Constraints

- No new npm dependencies
- All identifiers and comments in English
- Biome for linting/formatting — run `bun run check:fix` before each commit
- TypeScript strict mode — run `bun x tsc --noEmit` before each commit
- TDD: failing test first, then implementation
- Unit tests use real SQLite via `createTempDbPath` — no DB mocks
- No `Co-Authored-By: Claude` in commits

---

## File Map

| File | Change |
|---|---|
| `src/db/types.ts` | Add `'pr_opened'` to `ActivityEventType` |
| `src/db/activity/activity-repo.ts` | Add `countNewSince(since: Date): number` to interface |
| `src/db/activity/sqlite-activity-repo.ts` | Implement `countNewSince` |
| `src/services/activity-service.ts` | Handle `pr_opened` in `mapEvents`; add `countNewSince` to type + impl |
| `src/routes/route-handler.ts` | Add `htmlWithTrigger` helper |
| `src/routes/card-route.ts` | Read header, call `countNewSince`, add trigger when count > 0 |
| `src/templates/page-template.ts` | Add badge JS to `CLIENT_SCRIPT` |
| `tests/unit/db/activity-repo.test.ts` | New test for `countNewSince` |
| `tests/unit/services/activity-service.test.ts` | New test for `pr_opened` mapping + `countNewSince` |
| `tests/unit/routes/card-route.test.ts` | Update `makeActivityService` mock; new test for trigger header |
| `tests/e2e/dashboard.spec.ts` | New test: title badge appears after watermark reset + card poll |

---

### Task 1: `pr_opened` event type + mapEvents

**Files:**
- Modify: `src/db/types.ts:60-67`
- Modify: `src/services/activity-service.ts:90-111`
- Test: `tests/unit/services/activity-service.test.ts`

**Interfaces:**
- Produces: `ActivityEventType` now includes `'pr_opened'`; `mapEvents` emits it for `action === 'opened'`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/unit/services/activity-service.test.ts` (after the existing `pr_abandoned` test):

```typescript
test('sync maps PullRequestEvent (opened) to pr_opened activity and adds prs hint', async () => {
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
        id: 'evt_010',
        type: 'PullRequestEvent',
        actor: { login: 'carol' },
        payload: {
          action: 'opened',
          pull_request: {
            number: 55,
            title: 'feat: new feature',
            merged: false,
            html_url: 'https://github.com/alice/alpha/pull/55',
          },
        },
        repo: { name: 'alice/alpha' },
        createdAt: '2026-06-23T10:00:00Z',
      },
    ],
    etag: '"e10"',
    pollIntervalSecs: 60,
  }))
  const service = createActivityService(repos, makeClient({ getRepoEvents }))

  const result = await service.sync('alice/alpha')

  expect(result.refreshNeeded.has('prs')).toBe(true)
  expect(result.activities).toHaveLength(1)
  expect(result.activities[0]?.eventType).toBe('pr_opened')
  expect(result.activities[0]?.actor).toBe('@carol')
  expect(result.activities[0]?.subject).toBe('opened #55 — feat: new feature')

  repos.close()
  cleanupTempDir(dir)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/unit/services/activity-service.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `expect(received).toBe('pr_opened')` — `pr_opened` is not yet a valid type.

- [ ] **Step 3: Add `pr_opened` to types**

In `src/db/types.ts`, change `ActivityEventType`:

```typescript
export type ActivityEventType =
  | 'pr_merged'
  | 'pr_abandoned'
  | 'pr_opened'
  | 'pr_review_approved'
  | 'pr_review_changes_requested'
  | 'release'
  | 'push'
  | 'security_alert'
```

- [ ] **Step 4: Implement `pr_opened` in mapEvents**

In `src/services/activity-service.ts`, replace the `PullRequestEvent` block (lines 90–111):

```typescript
    if (event.type === 'PullRequestEvent') {
      const p = event.payload as {
        action: string
        pull_request: { number: number; title: string; merged: boolean; html_url: string }
      }
      const pr = p.pull_request
      if (p.action === 'opened') {
        hints.add('prs')
        activities.push({
          repoFullName: fullName,
          eventType: 'pr_opened',
          actor,
          subject: `opened #${pr.number} — ${pr.title}`,
          linkUrl: pr.html_url,
          occurredAt,
          recordedAt: now,
          githubEventId: event.id,
        })
      } else if (p.action === 'closed') {
        hints.add('prs')
        const eventType: ActivityEventType = pr.merged ? 'pr_merged' : 'pr_abandoned'
        const subject = pr.merged
          ? `merged #${pr.number} — ${pr.title}`
          : `closed #${pr.number} without merging`
        activities.push({
          repoFullName: fullName,
          eventType,
          actor,
          subject,
          linkUrl: pr.html_url,
          occurredAt,
          recordedAt: now,
          githubEventId: event.id,
        })
      }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun test tests/unit/services/activity-service.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 6: Type-check and lint**

```bash
bun x tsc --noEmit && bun run check:fix
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/db/types.ts src/services/activity-service.ts tests/unit/services/activity-service.test.ts
git commit -m "feat(activity): track pr_opened events from GitHub Events API"
```

---

### Task 2: `ActivityRepo.countNewSince`

**Files:**
- Modify: `src/db/activity/activity-repo.ts`
- Modify: `src/db/activity/sqlite-activity-repo.ts`
- Test: `tests/unit/db/activity-repo.test.ts`

**Interfaces:**
- Produces: `ActivityRepo.countNewSince(since: Date): number` — counts all rows in `activity` table where `recorded_at > since`, across all repos

- [ ] **Step 1: Write the failing tests**

Add these tests to `tests/unit/db/activity-repo.test.ts` (inside the existing `describe('ActivityRepo', ...)` block):

```typescript
  test('countNewSince returns 0 when no activities exist', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    expect(repos.activity.countNewSince(new Date(0))).toBe(0)

    repos.close()
  })

  test('countNewSince counts rows recorded after the given timestamp', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const cutoff = new Date('2026-06-23T10:00:00Z')

    repos.activity.upsertActivities('alice/alpha', [
      makeActivity({
        recordedAt: new Date('2026-06-23T09:59:00Z'),
        githubEventId: 'before',
      }),
      makeActivity({
        recordedAt: new Date('2026-06-23T10:01:00Z'),
        githubEventId: 'after1',
      }),
      makeActivity({
        repoFullName: 'alice/beta',
        recordedAt: new Date('2026-06-23T10:02:00Z'),
        githubEventId: 'after2',
      }),
    ])

    expect(repos.activity.countNewSince(cutoff)).toBe(2)

    repos.close()
  })

  test('countNewSince does not count rows recorded exactly at the cutoff', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-act-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)
    const cutoff = new Date('2026-06-23T10:00:00Z')

    repos.activity.upsertActivities('alice/alpha', [
      makeActivity({
        recordedAt: cutoff,
        githubEventId: 'exact',
      }),
    ])

    expect(repos.activity.countNewSince(cutoff)).toBe(0)

    repos.close()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/unit/db/activity-repo.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `repos.activity.countNewSince is not a function`.

- [ ] **Step 3: Add method to interface**

In `src/db/activity/activity-repo.ts`:

```typescript
import type { Activity, ActivityMeta } from '../types.ts'

export interface ActivityRepo {
  getActivities(fullName: string): Activity[]
  upsertActivities(fullName: string, activities: ReadonlyArray<Omit<Activity, 'id'>>): void
  replaceSecurityAlerts(fullName: string, alerts: ReadonlyArray<Omit<Activity, 'id'>>): void
  getDependabotCount(fullName: string): number
  countNewSince(since: Date): number
  getMeta(fullName: string): ActivityMeta | null
  upsertMeta(fullName: string, meta: Partial<Omit<ActivityMeta, 'repoFullName'>>): void
}
```

- [ ] **Step 4: Implement in SQLite repo**

In `src/db/activity/sqlite-activity-repo.ts`, add `countNewSince` after `getDependabotCount`:

```typescript
    countNewSince(since: Date) {
      const row = db
        .query<{ count: number }, [string]>(
          'SELECT COUNT(*) as count FROM activity WHERE recorded_at > ?',
        )
        .get(since.toISOString())
      return row?.count ?? 0
    },
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test tests/unit/db/activity-repo.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 6: Type-check and lint**

```bash
bun x tsc --noEmit && bun run check:fix
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/db/activity/activity-repo.ts src/db/activity/sqlite-activity-repo.ts tests/unit/db/activity-repo.test.ts
git commit -m "feat(activity): add countNewSince to ActivityRepo"
```

---

### Task 3: Wire card route to emit `newEvents` trigger

**Files:**
- Modify: `src/services/activity-service.ts`
- Modify: `src/routes/route-handler.ts`
- Modify: `src/routes/card-route.ts`
- Test: `tests/unit/routes/card-route.test.ts`
- Test: `tests/unit/services/activity-service.test.ts`

**Interfaces:**
- Consumes: `ActivityRepo.countNewSince(since: Date): number` from Task 2
- Produces: `ActivityService.countNewSince(since: Date): number`; `htmlWithTrigger(body, trigger)` helper; `GET /api/cards` returns `HX-Trigger: {"newEvents":{"count":N}}` when N > 0

- [ ] **Step 1: Write failing test for ActivityService.countNewSince**

Add to `tests/unit/services/activity-service.test.ts`:

```typescript
test('countNewSince delegates to repo and returns count', async () => {
  const { dir, dbPath } = createTempDbPath('gh-dash-act-svc-')
  cleanup.push(dir)
  const repos = createSqliteRepos(dbPath)
  const cutoff = new Date('2026-06-23T10:00:00Z')

  repos.activity.upsertActivities('alice/alpha', [
    {
      repoFullName: 'alice/alpha',
      eventType: 'pr_opened',
      actor: '@bob',
      subject: 'opened #1 — test',
      linkUrl: 'https://github.com/alice/alpha/pull/1',
      occurredAt: new Date('2026-06-23T10:01:00Z'),
      recordedAt: new Date('2026-06-23T10:01:00Z'),
      githubEventId: 'x',
    },
  ])

  const service = createActivityService(repos, makeClient())
  expect(service.countNewSince(cutoff)).toBe(1)
  expect(service.countNewSince(new Date('2026-06-23T10:02:00Z'))).toBe(0)

  repos.close()
  cleanupTempDir(dir)
})
```

- [ ] **Step 2: Write failing test for card route trigger header**

In `tests/unit/routes/card-route.test.ts`, first update `makeActivityService` to include the new method:

```typescript
function makeActivityService(overrides: Partial<ActivityService> = {}): ActivityService {
  return {
    sync: mock(async () => ({ activities: [], refreshNeeded: new Set<RefreshHint>() })),
    countNewSince: mock(() => 0),
    ...overrides,
  }
}
```

Then add this test (inside the existing `describe('card routes', ...)` block):

```typescript
  test('GET /api/cards includes HX-Trigger newEvents when countNewSince > 0', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    const activityService = makeActivityService({
      countNewSince: mock(() => 3),
    })
    const routes = createCardRoutes(
      makeCardService(repos),
      activityService,
      repos.auth,
      makeClient(),
    )

    const url = new URL('http://localhost:4242/api/cards')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')

    const req = new Request(url.href, {
      headers: { 'X-Last-Seen-Event-At': '0' },
    })
    const res = await route.handle(req, url)

    const trigger = res.headers.get('HX-Trigger')
    expect(trigger).not.toBeNull()
    const parsed = JSON.parse(trigger!)
    expect(parsed.newEvents.count).toBe(3)

    repos.close()
    cleanupTempDir(dir)
  })

  test('GET /api/cards omits HX-Trigger when countNewSince returns 0', async () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-card-route-')
    const repos = createSqliteRepos(dbPath)
    const activityService = makeActivityService({
      countNewSince: mock(() => 0),
    })
    const routes = createCardRoutes(
      makeCardService(repos),
      activityService,
      repos.auth,
      makeClient(),
    )

    const url = new URL('http://localhost:4242/api/cards')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')

    const req = new Request(url.href, {
      headers: { 'X-Last-Seen-Event-At': String(Date.now()) },
    })
    const res = await route.handle(req, url)

    expect(res.headers.get('HX-Trigger')).toBeNull()

    repos.close()
    cleanupTempDir(dir)
  })
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun test tests/unit/services/activity-service.test.ts tests/unit/routes/card-route.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: FAIL — `service.countNewSince is not a function` and type errors on `makeActivityService`.

- [ ] **Step 4: Add `countNewSince` to ActivityService type and implementation**

In `src/services/activity-service.ts`, update the `ActivityService` type:

```typescript
export type ActivityService = {
  sync(fullName: string): Promise<SyncResult>
  countNewSince(since: Date): number
}
```

Add to the returned object in `createActivityService`:

```typescript
    countNewSince(since: Date) {
      return repos.activity.countNewSince(since)
    },
```

Full updated `createActivityService` return:

```typescript
  return {
    async sync(fullName) {
      // ... (unchanged)
    },

    countNewSince(since: Date) {
      return repos.activity.countNewSince(since)
    },
  }
```

- [ ] **Step 5: Add `htmlWithTrigger` to route-handler**

In `src/routes/route-handler.ts`, add after `htmxTrigger`:

```typescript
export function htmlWithTrigger(body: string, trigger: Record<string, unknown>): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'HX-Trigger': JSON.stringify(trigger),
    },
  })
}
```

- [ ] **Step 6: Update card route GET /api/cards**

In `src/routes/card-route.ts`, update the import and the `GET /api/cards` handler:

Add `htmlWithTrigger` to the import from `route-handler.ts`:
```typescript
import { html, htmxTrigger, htmlWithTrigger, redirect } from './route-handler.ts'
```

Replace the `GET /api/cards` handler body:

```typescript
    {
      match: (url, method) => url.pathname === '/api/cards' && method === 'GET',
      async handle(req) {
        const pinned = cardService.getPinned()
        const results = await Promise.allSettled(
          pinned.map((fullName) => buildCardVm(fullName, cardService, activityService)),
        )
        const vms = results
          .filter(
            (r): r is PromiseFulfilledResult<ReturnType<typeof toCardViewModel>> =>
              r.status === 'fulfilled',
          )
          .map((r) => r.value)

        const rawTs = req.headers.get('X-Last-Seen-Event-At')
        const sinceMs = rawTs !== null ? Number(rawTs) : 0
        const since = new Date(Number.isFinite(sinceMs) ? sinceMs : 0)
        const newCount = activityService.countNewSince(since)
        const cardsHtml = renderCards(vms)

        return newCount > 0
          ? htmlWithTrigger(cardsHtml, { newEvents: { count: newCount } })
          : html(cardsHtml)
      },
    },
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
bun test tests/unit/services/activity-service.test.ts tests/unit/routes/card-route.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 8: Run full unit test suite**

```bash
bun test tests/unit --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 9: Type-check and lint**

```bash
bun x tsc --noEmit && bun run check:fix
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/services/activity-service.ts src/routes/route-handler.ts src/routes/card-route.ts tests/unit/services/activity-service.test.ts tests/unit/routes/card-route.test.ts
git commit -m "feat(cards): emit HX-Trigger newEvents when new activity exists since last poll"
```

---

### Task 4: Client-side favicon badge + title prefix

**Files:**
- Modify: `src/templates/page-template.ts`
- Test: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `HX-Trigger: {"newEvents":{"count":N}}` from Task 3; `window._lastSeenAt` exposed on window for E2E test manipulation

- [ ] **Step 1: Write the failing E2E test**

Add to `tests/e2e/dashboard.spec.ts`:

```typescript
test('browser tab shows count in title when new events arrive after watermark', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('[data-card-name]')

  // Reset watermark to epoch so all seeded activities appear "new"
  await page.evaluate(() => {
    (window as unknown as { _lastSeenAt: number })._lastSeenAt = 0
  })

  // Click Refresh to trigger an /api/cards poll with X-Last-Seen-Event-At: 0
  await page.click('button:has-text("Refresh")')
  await page.waitForFunction(() => document.title.includes('('))

  const title = await page.title()
  expect(title).toMatch(/^\(\d+\) GitHub Dashboard$/)
})

test('browser tab title clears badge on tab focus simulation', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('[data-card-name]')

  // Set badge state
  await page.evaluate(() => {
    (window as unknown as { _lastSeenAt: number })._lastSeenAt = 0
  })
  await page.click('button:has-text("Refresh")')
  await page.waitForFunction(() => document.title.includes('('))

  // Simulate tab becoming visible (visibilitychange fires on page.bringToFront)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  const title = await page.title()
  expect(title).toBe('GitHub Dashboard')
})
```

- [ ] **Step 2: Run E2E test to verify it fails**

```bash
bun run test:e2e 2>&1 | grep -A5 "browser tab"
```

Expected: FAIL — `waitForFunction` times out because title never gains `(`.

- [ ] **Step 3: Add badge JS to CLIENT_SCRIPT in page-template.ts**

`CLIENT_SCRIPT` is a template literal. Append this block at the end, before the closing backtick:

```typescript
window._lastSeenAt = Date.now();
(function() {
  var _origFavicon = '${FAVICON_B64}';
  function _showBadge(n) {
    document.title = '(' + n + ') GitHub Dashboard';
    var c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    var ctx = c.getContext('2d');
    var img = new Image();
    img.onload = function() {
      ctx.drawImage(img, 0, 0, 32, 32);
      ctx.fillStyle = '#f85149';
      ctx.beginPath();
      ctx.arc(24, 8, 8, 0, Math.PI * 2);
      ctx.fill();
      var link = document.querySelector('link[rel="icon"]');
      if (link) link.href = c.toDataURL();
    };
    img.src = _origFavicon;
  }
  function _clearBadge() {
    document.title = 'GitHub Dashboard';
    var link = document.querySelector('link[rel="icon"]');
    if (link) link.href = _origFavicon;
    window._lastSeenAt = Date.now();
  }
  document.body.addEventListener('htmx:configRequest', function(e) {
    if (e.detail.path === '/api/cards')
      e.detail.headers['X-Last-Seen-Event-At'] = String(window._lastSeenAt);
  });
  document.body.addEventListener('newEvents', function(e) {
    var n = (e.detail && e.detail.count) || 0;
    if (n > 0) _showBadge(n);
  });
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) _clearBadge();
  });
})();
```

Note: `${FAVICON_B64}` interpolates the base64 string directly into the JS at render time — this is valid because `CLIENT_SCRIPT` is a TypeScript template literal.

- [ ] **Step 4: Run E2E tests to verify they pass**

```bash
bun run test:e2e 2>&1 | tail -20
```

Expected: all E2E tests PASS including the two new badge tests.

- [ ] **Step 5: Run full unit test suite**

```bash
bun test tests/unit 2>&1 | tail -10
```

Expected: all tests PASS (no regressions in page-template unit tests).

- [ ] **Step 6: Type-check and lint**

```bash
bun x tsc --noEmit && bun run check:fix
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/templates/page-template.ts tests/e2e/dashboard.spec.ts
git commit -m "feat(ui): show favicon badge and title count on new activity events"
```
