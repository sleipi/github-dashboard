# ViewModel Tightening — Design Spec

**Date:** 2026-06-22
**Goal:** Move all remaining inline logic out of renderer functions into ViewModel builders, so renderers become pure property interpolation. This aligns the template layer with Go's `html/template` expectations and improves testability.

---

## Context

The template layer already follows a data-first pattern: ViewModels are pre-computed in builders, renderers emit HTML strings. However, several renderers still contain inline logic — regex transforms, conditional style strings, formatter calls, and IIFEs — that belong in the builder layer. This spec defines exactly what moves where.

---

## Scope

Three categories of changes:

### A — Missing ViewModel properties (existing ViewModels)

**`CardViewModel`** additions + removals (`src/templates/types.ts`):

| Property | Type | Replaces inline expression |
|---|---|---|
| `hasActivities` | `boolean` | `vm.activities.length > 0` |
| `loadingId` | `string` | `` `ld-${vm.fullName.replace(/[^a-z0-9]/gi, '-')}` `` |
| `borderStyle` | `string` | Ternary building `; box-shadow: ...` |

`borderStyle` is the full inline-style value for the card's border/glow, e.g. `"border-color:#2ea043; box-shadow:0 0 0 1px #2ea043"` or `"border-color:#30363d"`. **Removes** the existing `borderColor` and `borderGlow` properties from `CardViewModel` — they are subsumed by `borderStyle`.

**`PrRowViewModel`** addition + removal:

| Property | Type | Replaces inline expression |
|---|---|---|
| `highlightStyle` | `string` | `HIGHLIGHT_OPACITIES[pr.newHighlightHours]` + rgba string |

`highlightStyle` is `""` or `"background:rgba(34,197,94,0.42)"` — the renderer only interpolates it into a `style` attribute. **Removes** `newHighlightHours: number | null` from `PrRowViewModel`.

**`RepoListItemViewModel`** additions:

| Property | Type | Replaces inline expression |
|---|---|---|
| `checkboxChecked` | `"0" \| "1"` | `vm.isPinned ? '1' : '0'` |
| `checkboxBorderColor` | `string` | `vm.isPinned ? '#238636' : '#30363d'` |
| `checkboxBackground` | `string` | `vm.isPinned ? '#238636' : 'transparent'` |
| `checkboxSvg` | `string` | Conditional SVG markup or `""` |
| `languageDisplay` | `string` | `` vm.language ? ` · ${escapeHtml(vm.language)}` : '' `` |

### B — New ViewModels for modals

`renderPrModal` and `renderActivityModal` currently receive raw domain objects and call formatters directly. Each gets a ViewModel and a builder.

**New types in `src/templates/types.ts`:**

```
LabelViewModel
  name: string
  style: string   // pre-computed from hex color

PrRowModalItem
  prUrl, number, title, draft, ciColor, ciLabel, creator: string/number/boolean
  createdAt: string   // pre-formatted relative timestamp
  updatedAt: string
  labels: readonly LabelViewModel[]

PrModalViewModel
  fullName: string
  prs: readonly PrRowModalItem[]

ActivityModalItem
  linkUrl: string
  text: string      // "actor subject" pre-concatenated
  timeAgo: string

ActivityModalViewModel
  fullName: string
  hasActivities: boolean
  activities: readonly ActivityModalItem[]
```

**New builder functions:**
- `toPrModalViewModel(fullName: string, prs: PullRequest[], now: Date): PrModalViewModel` — in `pr-modal-template.ts`
- `toActivityModalViewModel(fullName: string, activities: Activity[], now: Date): ActivityModalViewModel` — in `activity-template.ts`

`renderPrModal` and `renderActivityModal` keep their existing public signatures (`fullName, prs[]` / `fullName, activities[]`) — builders are called internally, route handlers do not change.

### C — `renderDashboard` IIFE logic

The header PAT-expiry button and the PAT modal both compute `daysUntilExpiry()`, `SEVERITY_COLOR[severity]`, and label strings via IIFEs inside the template string. These move into a `DashboardViewModel`.

**New types in `src/templates/types.ts`:**

```
ExpiryBannerViewModel
  color: string         // hex, from SEVERITY_COLOR
  buttonTitle: string   // "Token expires in 3 days (2026-07-01)"
  modalLabel: string    // "Your token expires on 2026-07-01 (in 3 days)"

DashboardViewModel
  cardsHtml: string
  username: string
  avatarUrl: string | null
  expiry: ExpiryBannerViewModel | null
```

**New builder:** `toDashboardViewModel(cardsHtml, username, avatarUrl, expiresAt, severity): DashboardViewModel` — in `page-template.ts`.

`renderDashboard` signature changes from individual params to `(vm: DashboardViewModel)`. The route handler creates the ViewModel with `toDashboardViewModel(...)` before calling the renderer.

---

## Unchanged

- Route handler signatures (except `renderDashboard` caller constructs a ViewModel first)
- `escapeHtml()` calls in renderers on raw string values — Go's `html/template` auto-escapes, TypeScript doesn't, so these stay for safety
- Client-side JavaScript, CSS, HTMX attributes
- Database, services, GitHub client

---

## File Changes

| File | Change |
|---|---|
| `src/templates/types.ts` | Add all new types |
| `src/templates/card-template.ts` | Extend `toCardViewModel`; update `renderCard` |
| `src/templates/pr-modal-template.ts` | Add `toPrModalViewModel`; update `renderPrModal` |
| `src/templates/activity-template.ts` | Add `toActivityModalViewModel`; update `renderActivityModal` |
| `src/templates/modal-template.ts` | Extend `toRepoListItem`; update `renderRepoRow` |
| `src/templates/page-template.ts` | Add `toDashboardViewModel`; update `renderDashboard` |
| `src/routes/card-route.ts` | Update `renderDashboard` call site |

---

## Verification

1. `bun x tsc --noEmit` — no type errors
2. `bun run check` — Biome clean
3. `bun test tests/unit` — all unit tests pass
4. `bun run test:e2e` — all Playwright tests pass
5. Manual: start dev server, open dashboard, verify cards render, PR modal opens, activity modal opens, repo picker works
