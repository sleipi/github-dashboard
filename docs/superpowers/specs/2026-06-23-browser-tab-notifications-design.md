# Browser Tab Notifications + PR Open Events

**Date:** 2026-06-23
**Status:** Approved

## Goal

Show a favicon badge + title prefix on the browser tab when any new activity event is stored in the DB since the user last viewed the dashboard. Also capture PR open events (currently filtered out).

## Approach

Piggyback on the existing HTMX 10s card poll (`GET /api/cards`). Client sends `X-Last-Seen-Event-At` header with each poll. Server counts new activities since that timestamp. If count > 0, server adds `HX-Trigger: {"newEvents": {"count": N}}` to the response. Client JS shows badge + title. Badge clears on tab focus.

## Changes

### 1. `src/db/types.ts`
Add `'pr_opened'` to `ActivityEventType`.

### 2. `src/db/activity/activity-repo.ts`
Add method to interface:
```ts
countNewSince(since: Date): number
```
Global — counts across all repos, no filter by `repoFullName`.

### 3. `src/db/activity/sqlite-activity-repo.ts`
Implement:
```sql
SELECT COUNT(*) as count FROM activity WHERE recorded_at > ?
```

### 4. `src/services/activity-service.ts`
In `mapEvents`: handle `PullRequestEvent` with `action === 'opened'`:
- Emit `pr_opened` activity: `@actor opened #N — title`
- Add `hints.add('prs')`

Add `countNewSince(since: Date): number` to `ActivityService` type and implementation (delegates to `repos.activity.countNewSince`).

### 5. `src/routes/route-handler.ts`
Add helper (keeps `html()` unchanged):
```ts
export function htmlWithTrigger(body: string, trigger: Record<string, unknown>): Response
```

### 6. `src/routes/card-route.ts`
`GET /api/cards` handler:
- Read `X-Last-Seen-Event-At` header → parse as ms timestamp, default to 0 if missing/invalid
- After building VMs, call `activityService.countNewSince(new Date(since))`
- If count > 0: return `htmlWithTrigger(renderCards(vms), { newEvents: { count } })`
- Else: return `html(renderCards(vms))` as before

### 7. `src/templates/page-template.ts`
Add to `CLIENT_SCRIPT`:

```js
// Watermark — reset to now on each page load and on badge clear
let _lastSeenAt = Date.now();

// Inject header into HTMX card polls
document.body.addEventListener('htmx:configRequest', e => {
  if (e.detail.path === '/api/cards')
    e.detail.headers['X-Last-Seen-Event-At'] = String(_lastSeenAt);
});

// Badge show/clear
var _origFavicon = '...FAVICON_B64...';
function _showBadge(n) {
  document.title = '(' + n + ') GitHub Dashboard';
  var c = document.createElement('canvas'); c.width = 32; c.height = 32;
  var ctx = c.getContext('2d');
  var img = new Image();
  img.onload = function() {
    ctx.drawImage(img, 0, 0, 32, 32);
    ctx.fillStyle = '#f85149';
    ctx.beginPath(); ctx.arc(24, 8, 8, 0, Math.PI * 2); ctx.fill();
    var link = document.querySelector('link[rel="icon"]');
    if (link) link.href = c.toDataURL();
  };
  img.src = _origFavicon;
}
function _clearBadge() {
  document.title = 'GitHub Dashboard';
  var link = document.querySelector('link[rel="icon"]');
  if (link) link.href = _origFavicon;
  _lastSeenAt = Date.now();
}

document.body.addEventListener('newEvents', function(e) {
  var n = (e.detail && e.detail.count) || 0;
  if (n > 0) _showBadge(n);
});

document.addEventListener('visibilitychange', function() {
  if (!document.hidden) _clearBadge();
});
```

## Tests

- **Unit** (`tests/unit/`):
  - `ActivityRepo.countNewSince` — counts only rows with `recorded_at > since`
  - `ActivityService.countNewSince` — delegates correctly
  - `mapEvents` — `pr_opened` emitted for `PullRequestEvent` `action=opened`
- **E2E** (`tests/e2e/`):
  - Seed a `pr_opened` activity with `recorded_at` = now into test DB
  - Trigger HTMX poll (wait 10s or click refresh)
  - Assert `document.title` matches `/(\\d+) GitHub Dashboard/`

## Out of scope

- SSE / WebSockets
- Per-repo badge count breakdown
- Notification history panel
- Badge persistence across page reloads
