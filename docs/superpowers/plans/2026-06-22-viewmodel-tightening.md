# ViewModel Tightening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all remaining inline logic from template renderer functions into ViewModel builders, so renderers become pure property interpolation compatible with Go's `html/template` expectations.

**Architecture:** Each renderer that still contains conditionals or computations gets a ViewModel builder that pre-computes all display values. Renderers are updated to use only `vm.property` access. Types in `types.ts` are updated to reflect added/removed properties.

**Tech Stack:** TypeScript (strict), Bun test runner, Biome linter/formatter.

## Global Constraints

- All code, tests, and identifiers in English
- No new external dependencies
- `bun x tsc --noEmit` must pass after every task
- `bun run check` (Biome) must pass after every task
- `bun test tests/unit` must pass after every task
- No business logic in renderer functions; no HTML in builder functions

---

### Task 1: Card Template

**Files:**
- Modify: `src/templates/types.ts`
- Modify: `src/templates/card-template.ts`
- Modify: `tests/unit/templates/card-template.test.ts`

**Interfaces:**
- Removes `borderColor: string`, `borderGlow: string` from `CardViewModel`
- Removes `newHighlightHours: number | null` from `PrRowViewModel`
- Adds `borderStyle: string`, `hasActivities: boolean`, `loadingId: string` to `CardViewModel`
- Adds `highlightStyle: string` to `PrRowViewModel`

- [ ] **Step 1: Update `CardViewModel` and `PrRowViewModel` in `src/templates/types.ts`**

Replace the `PrRowViewModel` type (remove `newHighlightHours`, add `highlightStyle`):

```typescript
export type PrRowViewModel = {
  readonly number: number
  readonly title: string
  readonly draft: boolean
  readonly ciColor: string
  readonly ciLabel: string
  readonly prUrl: string
  readonly highlightStyle: string // "" or "background:rgba(34,197,94,0.42)"
}
```

Replace the `CardViewModel` type (remove `borderColor`, `borderGlow`, add `hasActivities`, `loadingId`, `borderStyle`):

```typescript
export type CardViewModel = {
  readonly fullName: string
  readonly owner: string
  readonly name: string
  readonly repoUrl: string
  readonly securityUrl: string
  readonly lastCommit: string
  readonly ciDotColor: string
  readonly ciDotLabel: string
  readonly showCiDot: boolean
  readonly depDisplay: string
  readonly depColor: string
  readonly depLabel: string
  readonly depTrend: string
  readonly hasDepTrend: boolean
  readonly depCollecting: boolean
  readonly activities: readonly ActivityItemViewModel[]
  readonly hasActivities: boolean
  readonly activityMore: number
  readonly hasActivityMore: boolean
  readonly prs: ReadonlyArray<PrRowViewModel>
  readonly hasPrs: boolean
  readonly noPrs: boolean
  readonly prTotal: number
  readonly prMore: number
  readonly hasMore: boolean
  readonly prMoreLabel: string
  readonly loadingId: string
  readonly borderStyle: string
}
```

- [ ] **Step 2: Update failing tests in `tests/unit/templates/card-template.test.ts`**

Replace the four `borderColor`/`borderGlow` tests (they reference removed properties) with `borderStyle` equivalents:

```typescript
test('borderStyle has grey border and no glow when lastCommitAt is null', () => {
  const data: CardData = {
    ...emptyCardData('alice/unknown'),
    cache: { ...emptyCardData('alice/unknown').cache, lastCommitAt: null },
  }
  const vm = toCardViewModel(data, [])
  expect(vm.borderStyle).toBe('border-color:#30363d')
})

test('borderStyle has green border and glow for a commit < 1 hour ago', () => {
  const data: CardData = {
    ...emptyCardData('alice/fresh'),
    cache: { ...emptyCardData('alice/fresh').cache, lastCommitAt: new Date(Date.now() - 10 * 60 * 1000) },
  }
  const vm = toCardViewModel(data, [])
  expect(vm.borderStyle).toContain('border-color:#2ea043')
  expect(vm.borderStyle).toContain('box-shadow')
})

test('borderStyle has medium-green border for a commit < 1 day ago', () => {
  const data: CardData = {
    ...emptyCardData('alice/today'),
    cache: { ...emptyCardData('alice/today').cache, lastCommitAt: new Date(Date.now() - 2 * 3_600_000) },
  }
  const vm = toCardViewModel(data, [])
  expect(vm.borderStyle).toContain('border-color:#1a6b32')
})

test('borderStyle has dark-green border for a commit < 3 days ago', () => {
  const data: CardData = {
    ...emptyCardData('alice/recent'),
    cache: { ...emptyCardData('alice/recent').cache, lastCommitAt: new Date(Date.now() - 2 * 86_400_000) },
  }
  const vm = toCardViewModel(data, [])
  expect(vm.borderStyle).toContain('border-color:#1a4228')
})

test('borderStyle has grey border for a commit > 3 days ago', () => {
  const data: CardData = {
    ...emptyCardData('alice/old'),
    cache: { ...emptyCardData('alice/old').cache, lastCommitAt: new Date(Date.now() - 7 * 86_400_000) },
  }
  const vm = toCardViewModel(data, [])
  expect(vm.borderStyle).toBe('border-color:#30363d')
})
```

Also add new tests for `loadingId` and `hasActivities` and `highlightStyle` (append to the `toCardViewModel` describe block):

```typescript
test('loadingId replaces slash and special chars with hyphens', () => {
  const vm = toCardViewModel(emptyCardData('owner/repo'), [])
  expect(vm.loadingId).toBe('ld-owner-repo')
})

test('hasActivities is false when activities array is empty', () => {
  const vm = toCardViewModel(emptyCardData('alice/alpha'), [])
  expect(vm.hasActivities).toBe(false)
})

test('hasActivities is true when activities are present', () => {
  const activity: Activity = {
    id: 1,
    repoFullName: 'alice/alpha',
    eventType: 'pr_merged',
    actor: 'bob',
    subject: 'merged #1',
    linkUrl: 'https://github.com/alice/alpha/pull/1',
    occurredAt: new Date(),
    recordedAt: new Date(),
    githubEventId: 'evt_1',
  }
  const vm = toCardViewModel(emptyCardData('alice/alpha'), [activity])
  expect(vm.hasActivities).toBe(true)
})
```

Add a new `describe` block for `PrRowViewModel.highlightStyle`:

```typescript
describe('PrRowViewModel — highlightStyle', () => {
  const basePr = (overrides: Partial<{ createdAt: Date; number: number; prUrl: string }> = {}) => ({
    repoFullName: 'alice/alpha',
    number: overrides.number ?? 1,
    title: 'Fix bug',
    draft: false,
    ciStatus: 'success' as const,
    prUrl: overrides.prUrl ?? 'https://github.com/alice/alpha/pull/1',
    creator: 'alice',
    labels: [],
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: new Date(),
  })

  test('highlightStyle is empty string for PRs older than 6 hours', () => {
    const pr = basePr({ createdAt: new Date(Date.now() - 7 * 3_600_000) })
    const vm = toCardViewModel({ ...emptyCardData('alice/alpha'), prs: [pr] }, [])
    expect(vm.prs[0].highlightStyle).toBe('')
  })

  test('highlightStyle contains rgba for a brand-new PR', () => {
    const pr = basePr({ createdAt: new Date() })
    const vm = toCardViewModel({ ...emptyCardData('alice/alpha'), prs: [pr] }, [])
    expect(vm.prs[0].highlightStyle).toContain('rgba(34,197,94,')
  })

  test('opacity is lower for a 3-hour-old PR than a brand-new one', () => {
    const newPr = basePr({ createdAt: new Date(), number: 1, prUrl: 'u1' })
    const oldPr = basePr({ createdAt: new Date(Date.now() - 3 * 3_600_000), number: 2, prUrl: 'u2' })
    const vm = toCardViewModel({ ...emptyCardData('alice/alpha'), prs: [newPr, oldPr] }, [])
    const extract = (style: string) =>
      parseFloat(style.match(/rgba\(34,197,94,([^)]+)\)/)?.[1] ?? '0')
    expect(extract(vm.prs[0].highlightStyle)).toBeGreaterThan(extract(vm.prs[1].highlightStyle))
  })
})
```

- [ ] **Step 3: Run tests — expect failures**

```bash
bun test tests/unit/templates/card-template.test.ts
```

Expected: errors referencing `borderColor`, `borderGlow`, `newHighlightHours` (removed properties), and missing `borderStyle`, `hasActivities`, `loadingId`, `highlightStyle`.

- [ ] **Step 4: Update `src/templates/card-template.ts`**

Replace `commitBorderStyle` with `buildBorderStyle` that returns a single string:

```typescript
function buildBorderStyle(lastCommitAt: Date | null): string {
  if (!lastCommitAt) return 'border-color:#30363d'
  const ageMs = Date.now() - lastCommitAt.getTime()
  const HOUR = 3_600_000
  const DAY = 86_400_000
  if (ageMs < HOUR) return 'border-color:#2ea043; box-shadow:0 0 0 1px #2ea043'
  if (ageMs < DAY) return 'border-color:#1a6b32; box-shadow:0 0 0 1px #1a6b3266'
  if (ageMs < 3 * DAY) return 'border-color:#1a4228'
  return 'border-color:#30363d'
}
```

Update the `PrRowViewModel` builder inside `toCardViewModel` (replace `newHighlightHours` with `highlightStyle`):

```typescript
const prRows: PrRowViewModel[] = displayPrs.map((pr) => {
  const ageHours = Math.floor((now.getTime() - pr.createdAt.getTime()) / 3_600_000)
  const opacityIdx = ageHours < 6 ? ageHours : null
  return {
    number: pr.number,
    title: pr.title,
    draft: pr.draft,
    ciColor: ciColor(pr.ciStatus),
    ciLabel: ciLabel(pr.ciStatus),
    prUrl: pr.prUrl,
    highlightStyle:
      opacityIdx !== null ? `background:rgba(34,197,94,${HIGHLIGHT_OPACITIES[opacityIdx]})` : '',
  }
})
```

Add `hasActivities`, `loadingId`, `borderStyle` to the return object of `toCardViewModel`, and remove `borderColor`/`borderGlow`:

```typescript
return {
  fullName,
  owner,
  name,
  repoUrl: `https://github.com/${fullName}`,
  securityUrl: `https://github.com/${fullName}/security/dependabot`,
  lastCommit: formatRelative(cache.lastCommitAt),
  ciDotColor: overallCi ? ciColor(overallCi) : 'transparent',
  ciDotLabel: overallCi ? ciLabel(overallCi) : '',
  showCiDot: overallCi !== null,
  depDisplay: String(dep),
  depColor: depColor(dep),
  depLabel: dep === 0 ? 'No Dependabot alerts' : `${dep} Alert${dep === 1 ? '' : 's'}`,
  depTrend: trendStr,
  hasDepTrend: trendStr.length > 0,
  depCollecting: trendStr.length === 0,
  activities: displayActivities.map((a) => toActivityItemViewModel(a, now)),
  hasActivities: displayActivities.length > 0,
  activityMore,
  hasActivityMore: activityMore > 0,
  prs: prRows,
  hasPrs: prRows.length > 0,
  noPrs: prRows.length === 0,
  prTotal: cache.prTotal,
  prMore,
  hasMore: prMore > 0,
  prMoreLabel: prMore === 1 ? '+ 1 more PR' : `+ ${prMore} more PRs`,
  loadingId: `ld-${fullName.replace(/[^a-z0-9]/gi, '-')}`,
  borderStyle: buildBorderStyle(cache.lastCommitAt),
}
```

Update `renderCard` — remove the `loadingId` local variable, update `style` and `id` and `hx-indicator` attributes, replace `vm.activities.length > 0` with `vm.hasActivities`, and replace the `bgStyle` computation with `pr.highlightStyle`:

```typescript
export function renderCard(vm: CardViewModel): string {
  const safeOwner = escapeHtml(vm.owner)
  const safeName = escapeHtml(vm.name)
  const safeFullName = escapeHtml(vm.fullName)
  return `
<div class="card" id="card-${safeOwner}-${safeName}" draggable="true" data-card-name="${safeFullName}"
     style="position:relative;${vm.borderStyle}">
  <div id="${vm.loadingId}" class="htmx-indicator"
       style="position:absolute;inset:0;background:rgba(22,27,34,0.88);z-index:10;
              padding:14px;border-radius:8px;display:flex;flex-direction:column;gap:10px;
              justify-content:center">
    <div class="skeleton" style="height:10px;border-radius:3px"></div>
    <div class="skeleton" style="height:10px;width:75%;border-radius:3px"></div>
    <div class="skeleton" style="height:10px;width:55%;border-radius:3px"></div>
  </div>
  <div class="card-header">
    <div style="flex:1;min-width:0;overflow:hidden">
      <a href="${vm.repoUrl}" target="_blank" rel="noopener noreferrer"
         style="text-decoration:none;color:inherit">
        <span style="font-size:11px;color:#6e7681">${safeOwner}/</span><span
          style="font-size:13px;font-weight:600">${safeName}</span>
      </a>
    </div>
    ${vm.showCiDot ? `<div class="ci-dot" style="background:${vm.ciDotColor}" title="${vm.ciDotLabel}"></div>` : ''}
    <button hx-get="/api/card/${safeOwner}/${safeName}"
            hx-target="closest .card" hx-swap="outerHTML"
            hx-indicator="#${vm.loadingId}"
            class="refresh-btn"
            style="background:transparent;border:none;padding:3px;color:#6e7681;cursor:pointer"
            title="Refresh">↻</button>
    <button hx-post="/api/cards/${safeOwner}/${safeName}"
            hx-swap="none" hx-on::after-request="htmx.trigger(document.body,'cardsChanged')"
            style="background:transparent;border:none;padding:3px 5px;color:#6e7681;cursor:pointer"
            title="Remove">×</button>
  </div>
  <div class="card-body">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;font-size:11px">
      <span style="color:#8b949e">⏱ ${vm.lastCommit}</span>
      <a href="${vm.securityUrl}" target="_blank" rel="noopener noreferrer"
         style="color:${vm.depColor};display:flex;align-items:center;gap:4px;text-decoration:none"
         title="${vm.depLabel}">
        🛡 ${vm.depDisplay}
        ${vm.hasDepTrend ? `<span style="font-size:10px;color:#6e7681">${vm.depTrend}</span>` : ''}
        ${vm.depCollecting ? `<span style="font-size:10px;color:#484f58" title="Building history…">···</span>` : ''}
      </a>
    </div>
    ${
      vm.hasActivities
        ? `
    <div style="border-top:1px solid #21262d;padding-top:7px;margin-bottom:8px;display:flex;flex-direction:column;gap:2px">
      ${vm.activities
        .map(
          (a) => `
      <a href="${escapeHtml(a.linkUrl)}" target="_blank" rel="noopener noreferrer"
         style="display:block;font-size:11px;color:#8b949e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none;padding:1px 0"
         onmouseover="this.style.color='#c9d1d9'" onmouseout="this.style.color='#8b949e'"
         title="${escapeHtml(a.text)} · ${escapeHtml(a.timeAgo)}">
        ${escapeHtml(a.text)}
      </a>`,
        )
        .join('')}
      ${
        vm.hasActivityMore
          ? `
      <button hx-get="/api/activity/${safeOwner}/${safeName}"
              hx-target="#modal" hx-swap="innerHTML"
              style="font-size:10px;color:#2f81f7;padding:2px 0;text-align:center;width:100%;background:transparent;border:none;cursor:pointer;font-family:inherit">
        · ${vm.activityMore} more activities
      </button>`
          : ''
      }
    </div>`
        : ''
    }
    <div style="border-top:1px solid #21262d;padding-top:9px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:10px;font-weight:600;color:#6e7681;text-transform:uppercase">Pull Requests</span>
        <span class="badge">${vm.prTotal}</span>
      </div>
      ${
        vm.hasPrs
          ? `
      <div style="display:flex;flex-direction:column;gap:1px">
        ${vm.prs
          .map((pr) => {
            const bgAttr = pr.highlightStyle ? ` style="${pr.highlightStyle}"` : ''
            return `
        <a href="${pr.prUrl}" target="_blank" rel="noopener noreferrer" class="pr-row"${bgAttr}>
          <div class="ci-dot" style="background:${pr.ciColor}" title="${pr.ciLabel}"></div>
          <span style="font-size:10px;color:#6e7681;font-family:monospace">#${pr.number}</span>
          <span style="font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${escapeHtml(pr.title)}</span>
          ${pr.draft ? '<span class="badge">Draft</span>' : ''}
          <svg width="10" height="10" viewBox="0 0 16 16" fill="#6e7681" style="flex-shrink:0"><path d="M10.604 1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.75.75 0 01-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1zM3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"/></svg>
        </a>`
          })
          .join('')}
      </div>
      ${
        vm.hasMore
          ? `
      <button hx-get="/api/prs/${safeOwner}/${safeName}"
              hx-target="#modal" hx-swap="innerHTML"
              style="width:100%;font-size:11px;color:#2f81f7;padding:5px;text-align:center;
                     background:transparent;border:none;cursor:pointer;font-family:inherit">
        ${vm.prMoreLabel}
      </button>`
          : ''
      }
      `
          : `
      <div style="font-size:12px;color:#8b949e;padding:5px">✓ No open PRs</div>`
      }
    </div>
  </div>
</div>`
}
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/unit/templates/card-template.test.ts
```

Expected: all tests pass

- [ ] **Step 6: Typecheck + lint**

```bash
bun x tsc --noEmit && bun run check
```

Expected: no errors

- [ ] **Step 7: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/templates/types.ts src/templates/card-template.ts tests/unit/templates/card-template.test.ts
git commit -m "refactor(templates): move card inline logic into ViewModel"
```

---

### Task 2: Modal Template (RepoListItem)

**Files:**
- Modify: `src/templates/types.ts`
- Modify: `src/templates/modal-template.ts`
- Modify: `tests/unit/templates/modal-template.test.ts`

**Interfaces:**
- Adds `checkboxChecked`, `checkboxBorderColor`, `checkboxBackground`, `checkboxSvg`, `languageDisplay` to `RepoListItemViewModel`
- `renderRepoRow` uses only `vm.*` property access — no ternaries

- [ ] **Step 1: Add new properties to `RepoListItemViewModel` in `src/templates/types.ts`**

```typescript
export type RepoListItemViewModel = {
  readonly fullName: string
  readonly name: string
  readonly owner: string
  readonly isPinned: boolean
  readonly isPrivate: boolean
  readonly language: string | null
  readonly starsDisplay: string | null
  readonly updatedAt: string
  readonly checkboxChecked: '0' | '1'
  readonly checkboxBorderColor: string
  readonly checkboxBackground: string
  readonly checkboxSvg: string
  readonly languageDisplay: string
}
```

- [ ] **Step 2: Add new ViewModel tests to `tests/unit/templates/modal-template.test.ts`**

Append a new `describe` block after the existing ones:

```typescript
describe('toRepoListItem — checkbox and language properties', () => {
  const CHECKBOX_SVG =
    '<svg width="9" height="9" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>'

  test('checkboxChecked is "1" when pinned', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), true)
    expect(vm.checkboxChecked).toBe('1')
  })

  test('checkboxChecked is "0" when not pinned', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), false)
    expect(vm.checkboxChecked).toBe('0')
  })

  test('checkboxBorderColor is green when pinned', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), true)
    expect(vm.checkboxBorderColor).toBe('#238636')
  })

  test('checkboxBorderColor is grey when not pinned', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), false)
    expect(vm.checkboxBorderColor).toBe('#30363d')
  })

  test('checkboxBackground is green when pinned', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), true)
    expect(vm.checkboxBackground).toBe('#238636')
  })

  test('checkboxBackground is transparent when not pinned', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), false)
    expect(vm.checkboxBackground).toBe('transparent')
  })

  test('checkboxSvg contains SVG markup when pinned', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), true)
    expect(vm.checkboxSvg).toBe(CHECKBOX_SVG)
  })

  test('checkboxSvg is empty string when not pinned', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), false)
    expect(vm.checkboxSvg).toBe('')
  })

  test('languageDisplay is " · TypeScript" when language is TypeScript', () => {
    const vm = toRepoListItem(makeRepo('alice/foo', { language: 'TypeScript' }), false)
    expect(vm.languageDisplay).toBe(' · TypeScript')
  })

  test('languageDisplay is empty string when language is null', () => {
    const vm = toRepoListItem(makeRepo('alice/foo', { language: null }), false)
    expect(vm.languageDisplay).toBe('')
  })

  test('languageDisplay escapes HTML in language name', () => {
    const vm = toRepoListItem(makeRepo('alice/foo', { language: '<script>' }), false)
    expect(vm.languageDisplay).not.toContain('<script>')
    expect(vm.languageDisplay).toContain('&lt;script&gt;')
  })
})
```

- [ ] **Step 3: Run tests — expect failures**

```bash
bun test tests/unit/templates/modal-template.test.ts
```

Expected: failures for missing `checkboxChecked`, `checkboxBorderColor`, etc.

- [ ] **Step 4: Update `src/templates/modal-template.ts`**

Update `toRepoListItem` to compute new properties:

```typescript
const CHECKBOX_SVG =
  '<svg width="9" height="9" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>'

export function toRepoListItem(repo: GitHubRepo, isPinned: boolean): RepoListItemViewModel {
  return {
    fullName: repo.fullName,
    name: repo.name,
    owner: repo.owner,
    isPinned,
    isPrivate: repo.isPrivate,
    language: repo.language,
    starsDisplay: repo.stargazersCount > 0 ? String(repo.stargazersCount) : null,
    updatedAt: formatRelative(new Date(repo.updatedAt)),
    checkboxChecked: isPinned ? '1' : '0',
    checkboxBorderColor: isPinned ? '#238636' : '#30363d',
    checkboxBackground: isPinned ? '#238636' : 'transparent',
    checkboxSvg: isPinned ? CHECKBOX_SVG : '',
    languageDisplay: repo.language ? ` · ${escapeHtml(repo.language)}` : '',
  }
}
```

Update `renderRepoRow` to use only `vm.*` properties (no inline ternaries for checkbox state):

```typescript
export function renderRepoRow(vm: RepoListItemViewModel): string {
  const safeOwner = escapeHtml(vm.owner)
  const safeName = escapeHtml(vm.name)
  const safeFullName = escapeHtml(vm.fullName)
  return `
<div data-repo-name="${safeFullName}"
     style="display:flex;align-items:center;gap:12px;padding:10px 16px;
            border-bottom:1px solid #21262d;cursor:pointer"
     hx-post="/api/cards/${safeOwner}/${safeName}"
     hx-swap="none"
     hx-on::after-request="htmx.trigger(document.body,'cardsChanged')"
     onclick="_toggleCheck(this)">
  <div class="check" data-checked="${vm.checkboxChecked}"
       style="width:16px;height:16px;border-radius:3px;flex-shrink:0;
       border:1.5px solid ${vm.checkboxBorderColor};
       background:${vm.checkboxBackground};
       display:flex;align-items:center;justify-content:center">
    ${vm.checkboxSvg}
  </div>
  <div style="flex:1;min-width:0">
    <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      <span style="color:#6e7681">${safeOwner}/</span><span style="font-weight:500">${safeName}</span>
      ${vm.isPrivate ? '<span class="badge" style="margin-left:6px">Private</span>' : ''}
    </div>
    <div style="font-size:11px;color:#6e7681;margin-top:2px">
      ${vm.updatedAt}${vm.languageDisplay}
    </div>
  </div>
  ${vm.starsDisplay ? `<span style="font-size:11px;color:#8b949e">★ ${vm.starsDisplay}</span>` : ''}
</div>`
}
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/unit/templates/modal-template.test.ts
```

Expected: all tests pass

- [ ] **Step 6: Typecheck + lint**

```bash
bun x tsc --noEmit && bun run check
```

Expected: no errors

- [ ] **Step 7: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/templates/types.ts src/templates/modal-template.ts tests/unit/templates/modal-template.test.ts
git commit -m "refactor(templates): move repo-list checkbox logic into ViewModel"
```

---

### Task 3: PR Modal ViewModel

**Files:**
- Modify: `src/templates/types.ts`
- Modify: `src/templates/pr-modal-template.ts`
- Modify: `tests/unit/templates/pr-modal-template.test.ts`

**Interfaces:**
- Adds `LabelViewModel`, `PrRowModalItem`, `PrModalViewModel` to `types.ts`
- Exports `toPrModalViewModel(fullName, prs, now)` from `pr-modal-template.ts`
- `renderPrModal(fullName, prs)` keeps the same public signature — builder called internally

- [ ] **Step 1: Add new types to `src/templates/types.ts`**

Append after the existing types:

```typescript
export type LabelViewModel = {
  readonly name: string
  readonly style: string // pre-computed from hex color
}

export type PrRowModalItem = {
  readonly prUrl: string
  readonly number: number
  readonly title: string
  readonly draft: boolean
  readonly ciColor: string
  readonly ciLabel: string
  readonly creator: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly labels: readonly LabelViewModel[]
}

export type PrModalViewModel = {
  readonly fullName: string
  readonly prs: readonly PrRowModalItem[]
}
```

- [ ] **Step 2: Add `toPrModalViewModel` tests to `tests/unit/templates/pr-modal-template.test.ts`**

Add an import for `toPrModalViewModel` and append a new `describe` block:

```typescript
import { renderPrModal, toPrModalViewModel } from '../../../src/templates/pr-modal-template.ts'
```

```typescript
describe('toPrModalViewModel', () => {
  test('maps fullName and pre-formats relative timestamps', () => {
    const now = new Date('2026-06-22T12:00:00Z')
    const pr = makePr({
      createdAt: new Date('2026-06-22T10:00:00Z'),
      updatedAt: new Date('2026-06-22T11:30:00Z'),
    })
    const vm = toPrModalViewModel('alice/alpha', [pr], now)
    expect(vm.fullName).toBe('alice/alpha')
    expect(vm.prs[0].createdAt).toContain('Std.')
    expect(vm.prs[0].updatedAt).toContain('Min.')
  })

  test('pre-computes ciColor from ciStatus', () => {
    const pr = makePr({ ciStatus: 'failure' })
    const vm = toPrModalViewModel('alice/alpha', [pr], new Date())
    expect(vm.prs[0].ciColor).toBe('#f85149')
  })

  test('pre-computes label style from hex color', () => {
    const pr = makePr({ labels: [{ name: 'bug', color: 'f85149' }] })
    const vm = toPrModalViewModel('alice/alpha', [pr], new Date())
    expect(vm.prs[0].labels[0].name).toBe('bug')
    expect(vm.prs[0].labels[0].style).toContain('rgba(248,81,73,')
  })

  test('escapes HTML in label name', () => {
    const pr = makePr({ labels: [{ name: '<xss>', color: 'ffffff' }] })
    const vm = toPrModalViewModel('alice/alpha', [pr], new Date())
    expect(vm.prs[0].labels[0].name).toBe('&lt;xss&gt;')
  })

  test('passes through draft and number', () => {
    const pr = makePr({ number: 42, draft: true })
    const vm = toPrModalViewModel('alice/alpha', [pr], new Date())
    expect(vm.prs[0].number).toBe(42)
    expect(vm.prs[0].draft).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests — expect failures**

```bash
bun test tests/unit/templates/pr-modal-template.test.ts
```

Expected: `toPrModalViewModel is not a function`

- [ ] **Step 4: Update `src/templates/pr-modal-template.ts`**

Export `toPrModalViewModel` and update `renderPrModal` to use it internally:

```typescript
import type { PullRequest } from '../db/types.ts'
import { ciColor, ciLabel, escapeHtml, formatRelative } from './formatters.ts'
import type { LabelViewModel, PrModalViewModel, PrRowModalItem } from './types.ts'

function labelStyle(hexColor: string): string {
  const r = Number.parseInt(hexColor.slice(0, 2), 16) || 139
  const g = Number.parseInt(hexColor.slice(2, 4), 16) || 148
  const b = Number.parseInt(hexColor.slice(4, 6), 16) || 158
  return `background:rgba(${r},${g},${b},.15);color:#${hexColor};border:1px solid rgba(${r},${g},${b},.5)`
}

export function toPrModalViewModel(
  fullName: string,
  prs: PullRequest[],
  now: Date,
): PrModalViewModel {
  return {
    fullName,
    prs: prs.map(
      (pr): PrRowModalItem => ({
        prUrl: pr.prUrl,
        number: pr.number,
        title: escapeHtml(pr.title),
        draft: pr.draft,
        ciColor: ciColor(pr.ciStatus),
        ciLabel: ciLabel(pr.ciStatus),
        creator: escapeHtml(pr.creator),
        createdAt: formatRelative(pr.createdAt, now),
        updatedAt: formatRelative(pr.updatedAt, now),
        labels: pr.labels.map(
          (l): LabelViewModel => ({
            name: escapeHtml(l.name),
            style: labelStyle(l.color),
          }),
        ),
      }),
    ),
  }
}

export function renderPrModal(fullName: string, prs: PullRequest[]): string {
  const vm = toPrModalViewModel(fullName, prs, new Date())
  const safeFullName = escapeHtml(vm.fullName)
  return `
<div class="modal-overlay"
     onclick="if(event.target===this)document.getElementById('modal').innerHTML=''">
  <div class="modal" style="width:60%;max-width:none" onclick="event.stopPropagation()">
    <div style="padding:14px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:14px;font-weight:600;flex:1">
        Pull Requests &nbsp;<span style="color:#6e7681;font-weight:400">${safeFullName}</span>
      </span>
      <button onclick="document.getElementById('modal').innerHTML=''"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    <div style="display:grid;grid-template-columns:76px 1fr 130px 106px 118px;
                padding:7px 16px;border-bottom:1px solid #21262d;
                font-size:10px;font-weight:600;color:#6e7681;text-transform:uppercase">
      <span>#</span><span>Titel</span>
      <span>Ersteller</span><span>Erstellt</span><span>Aktualisiert</span>
    </div>
    <div style="overflow-y:auto;flex:1">
      ${vm.prs
        .map(
          (pr) => `
      <a href="${pr.prUrl}" target="_blank" rel="noopener noreferrer"
         style="display:grid;grid-template-columns:76px 1fr 130px 106px 118px;
                padding:8px 16px;border-bottom:1px solid #21262d;
                text-decoration:none;color:inherit;align-items:center"
         onmouseover="this.style.background='#1c2128'" onmouseout="this.style.background=''">
        <div style="display:flex;align-items:center;gap:5px">
          <div class="ci-dot" style="background:${pr.ciColor}" title="${pr.ciLabel}"></div>
          <span style="font-size:11px;color:#6e7681;font-family:monospace">#${pr.number}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;min-width:0;padding-right:12px">
          <span style="font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${pr.title}
          </span>
          ${pr.draft ? '<span class="badge">Draft</span>' : ''}
          ${pr.labels.map((l) => `<span style="font-size:10px;border-radius:20px;padding:1px 7px;${l.style}">${l.name}</span>`).join('')}
        </div>
        <span style="font-size:11px;color:#8b949e">${pr.creator}</span>
        <span style="font-size:11px;color:#8b949e">${pr.createdAt}</span>
        <span style="font-size:11px;color:#8b949e">${pr.updatedAt}</span>
      </a>`,
        )
        .join('')}
    </div>
  </div>
</div>`
}
```

Note: `pr.title`, `pr.creator`, and `l.name` are already HTML-escaped by the builder, so no additional `escapeHtml()` call is needed in the renderer.

- [ ] **Step 5: Run tests**

```bash
bun test tests/unit/templates/pr-modal-template.test.ts
```

Expected: all tests pass

- [ ] **Step 6: Typecheck + lint**

```bash
bun x tsc --noEmit && bun run check
```

Expected: no errors

- [ ] **Step 7: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/templates/types.ts src/templates/pr-modal-template.ts tests/unit/templates/pr-modal-template.test.ts
git commit -m "refactor(templates): extract PR modal ViewModel builder"
```

---

### Task 4: Activity Modal ViewModel

**Files:**
- Modify: `src/templates/types.ts`
- Modify: `src/templates/activity-template.ts`
- Create: `tests/unit/templates/activity-template.test.ts`

**Interfaces:**
- Adds `ActivityModalItem`, `ActivityModalViewModel` to `types.ts`
- Exports `toActivityModalViewModel(fullName, activities, now)` from `activity-template.ts`
- `renderActivityModal(fullName, activities)` keeps the same public signature

- [ ] **Step 1: Add new types to `src/templates/types.ts`**

Append after `PrModalViewModel`:

```typescript
export type ActivityModalItem = {
  readonly linkUrl: string
  readonly text: string
  readonly timeAgo: string
}

export type ActivityModalViewModel = {
  readonly fullName: string
  readonly hasActivities: boolean
  readonly activities: readonly ActivityModalItem[]
}
```

- [ ] **Step 2: Create `tests/unit/templates/activity-template.test.ts`**

```typescript
import { describe, expect, test } from 'bun:test'
import type { Activity } from '../../../src/db/types.ts'
import {
  renderActivityModal,
  toActivityModalViewModel,
} from '../../../src/templates/activity-template.ts'

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1,
    repoFullName: 'alice/alpha',
    eventType: 'pr_merged',
    actor: 'bob',
    subject: 'merged #1',
    linkUrl: 'https://github.com/alice/alpha/pull/1',
    occurredAt: new Date('2026-06-22T10:00:00Z'),
    recordedAt: new Date(),
    githubEventId: 'evt_1',
    ...overrides,
  }
}

describe('toActivityModalViewModel', () => {
  test('hasActivities is false for empty array', () => {
    const vm = toActivityModalViewModel('alice/alpha', [], new Date())
    expect(vm.hasActivities).toBe(false)
  })

  test('hasActivities is true when activities present', () => {
    const vm = toActivityModalViewModel('alice/alpha', [makeActivity()], new Date())
    expect(vm.hasActivities).toBe(true)
  })

  test('text concatenates actor and subject', () => {
    const vm = toActivityModalViewModel('alice/alpha', [makeActivity({ actor: 'bob', subject: 'merged #1' })], new Date())
    expect(vm.activities[0].text).toBe('bob merged #1')
  })

  test('timeAgo is pre-formatted relative timestamp', () => {
    const now = new Date('2026-06-22T12:00:00Z')
    const activity = makeActivity({ occurredAt: new Date('2026-06-22T10:00:00Z') })
    const vm = toActivityModalViewModel('alice/alpha', [activity], now)
    expect(vm.activities[0].timeAgo).toContain('Std.')
  })

  test('linkUrl is passed through unchanged', () => {
    const url = 'https://github.com/alice/alpha/pull/99'
    const vm = toActivityModalViewModel('alice/alpha', [makeActivity({ linkUrl: url })], new Date())
    expect(vm.activities[0].linkUrl).toBe(url)
  })

  test('fullName is set correctly', () => {
    const vm = toActivityModalViewModel('alice/alpha', [], new Date())
    expect(vm.fullName).toBe('alice/alpha')
  })
})

describe('renderActivityModal', () => {
  test('renders fullName in header', () => {
    const html = renderActivityModal('alice/alpha', [])
    expect(html).toContain('alice/alpha')
  })

  test('shows empty state when no activities', () => {
    const html = renderActivityModal('alice/alpha', [])
    expect(html).toContain('No recent activity.')
  })

  test('renders activity text and link', () => {
    const html = renderActivityModal('alice/alpha', [makeActivity()])
    expect(html).toContain('bob merged #1')
    expect(html).toContain('https://github.com/alice/alpha/pull/1')
  })

  test('escapes HTML in activity text', () => {
    const html = renderActivityModal('alice/alpha', [
      makeActivity({ actor: '<evil>', subject: 'did stuff' }),
    ])
    expect(html).not.toContain('<evil>')
    expect(html).toContain('&lt;evil&gt;')
  })
})
```

- [ ] **Step 3: Run tests — expect failures**

```bash
bun test tests/unit/templates/activity-template.test.ts
```

Expected: `toActivityModalViewModel is not a function`

- [ ] **Step 4: Update `src/templates/activity-template.ts`**

```typescript
import type { Activity } from '../db/types.ts'
import { escapeHtml, formatRelative } from './formatters.ts'
import type { ActivityModalItem, ActivityModalViewModel } from './types.ts'

export function toActivityModalViewModel(
  fullName: string,
  activities: Activity[],
  now: Date,
): ActivityModalViewModel {
  return {
    fullName,
    hasActivities: activities.length > 0,
    activities: activities.map(
      (a): ActivityModalItem => ({
        linkUrl: a.linkUrl,
        text: `${a.actor} ${a.subject}`,
        timeAgo: formatRelative(a.occurredAt, now),
      }),
    ),
  }
}

export function renderActivityModal(fullName: string, activities: Activity[]): string {
  const vm = toActivityModalViewModel(fullName, activities, new Date())
  const safeFullName = escapeHtml(vm.fullName)
  return `
<div class="modal-overlay"
     onclick="if(event.target===this)document.getElementById('modal').innerHTML=''">
  <div class="modal" style="width:55%;max-width:none" onclick="event.stopPropagation()">
    <div style="padding:14px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:14px;font-weight:600;flex:1">
        Activity &nbsp;<span style="color:#6e7681;font-weight:400">${safeFullName}</span>
      </span>
      <button onclick="document.getElementById('modal').innerHTML=''"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    <div style="overflow-y:auto;flex:1;max-height:70vh">
      ${
        vm.hasActivities
          ? vm.activities
              .map(
                (a) => `
      <a href="${escapeHtml(a.linkUrl)}" target="_blank" rel="noopener noreferrer"
         style="display:flex;align-items:baseline;gap:10px;padding:9px 16px;
                border-bottom:1px solid #21262d;text-decoration:none;color:inherit"
         onmouseover="this.style.background='#1c2128'" onmouseout="this.style.background=''">
        <span style="font-size:12px;color:#c9d1d9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">
          ${escapeHtml(a.text)}
        </span>
        <span style="font-size:11px;color:#6e7681;flex-shrink:0">${a.timeAgo}</span>
      </a>`,
              )
              .join('')
          : '<div style="padding:20px;color:#8b949e;font-size:13px">No recent activity.</div>'
      }
    </div>
  </div>
</div>`
}
```

- [ ] **Step 5: Run tests**

```bash
bun test tests/unit/templates/activity-template.test.ts
```

Expected: all tests pass

- [ ] **Step 6: Typecheck + lint**

```bash
bun x tsc --noEmit && bun run check
```

Expected: no errors

- [ ] **Step 7: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/templates/types.ts src/templates/activity-template.ts tests/unit/templates/activity-template.test.ts
git commit -m "refactor(templates): extract activity modal ViewModel builder"
```

---

### Task 5: Dashboard ViewModel

**Files:**
- Modify: `src/templates/types.ts`
- Modify: `src/templates/page-template.ts`
- Modify: `src/routes/card-route.ts`
- Modify: `tests/unit/templates/page-template.test.ts`

**Interfaces:**
- Adds `ExpiryBannerViewModel`, `DashboardViewModel` to `types.ts`
- Exports `toDashboardViewModel(cardsHtml, username, avatarUrl, expiresAt, severity)` from `page-template.ts`
- `renderDashboard` signature changes to `(vm: DashboardViewModel)`
- `card-route.ts` wraps the `renderDashboard` call with `toDashboardViewModel`

- [ ] **Step 1: Add new types to `src/templates/types.ts`**

Append after `ActivityModalViewModel`:

```typescript
export type ExpiryBannerViewModel = {
  readonly color: string
  readonly buttonTitle: string
  readonly modalLabel: string
}

export type DashboardViewModel = {
  readonly cardsHtml: string
  readonly username: string
  readonly avatarUrl: string | null
  readonly expiry: ExpiryBannerViewModel | null
}
```

- [ ] **Step 2: Update `tests/unit/templates/page-template.test.ts`**

Add imports and a helper that wraps the new API so the existing assertion-level tests stay unchanged, and add new `toDashboardViewModel` tests:

```typescript
import {
  renderDashboard,
  renderSetupPage,
  toDashboardViewModel,
} from '../../../src/templates/page-template.ts'
import type { PatExpirySeverity } from '../../../src/services/pat-expiry-service.ts'
```

Add a helper at the top of the file (after imports) so all existing `renderDashboard(...)` calls keep working:

```typescript
function dashboard(
  cardsHtml: string,
  username: string,
  avatarUrl: string,
  expiresAt: Date | null = null,
  severity: PatExpirySeverity | null = null,
): string {
  return renderDashboard(toDashboardViewModel(cardsHtml, username, avatarUrl, expiresAt, severity))
}
```

Replace every `renderDashboard(` call in the existing tests with `dashboard(`.

Then append a new `describe` block for `toDashboardViewModel`:

```typescript
describe('toDashboardViewModel', () => {
  test('expiry is null when expiresAt is null', () => {
    const vm = toDashboardViewModel('', 'alice', '', null, null)
    expect(vm.expiry).toBeNull()
  })

  test('expiry is null when severity is null', () => {
    const vm = toDashboardViewModel('', 'alice', '', new Date(), null)
    expect(vm.expiry).toBeNull()
  })

  test('expiry.color matches severity info', () => {
    const vm = toDashboardViewModel('', 'alice', '', new Date(Date.now() + 86_400_000), 'info')
    expect(vm.expiry?.color).toBe('#388bfd')
  })

  test('expiry.color matches severity notice', () => {
    const vm = toDashboardViewModel('', 'alice', '', new Date(Date.now() + 86_400_000), 'notice')
    expect(vm.expiry?.color).toBe('#d29922')
  })

  test('expiry.color matches severity warning', () => {
    const vm = toDashboardViewModel('', 'alice', '', new Date(Date.now() + 86_400_000), 'warning')
    expect(vm.expiry?.color).toBe('#f85149')
  })

  test('expiry.buttonTitle contains date and days label', () => {
    const expires = new Date('2026-12-31T00:00:00.000Z')
    const vm = toDashboardViewModel('', 'alice', '', expires, 'info')
    expect(vm.expiry?.buttonTitle).toContain('2026-12-31')
    expect(vm.expiry?.buttonTitle).toContain('day')
  })

  test('expiry labels say "expired" when token is past due', () => {
    const past = new Date(Date.now() - 86_400_000)
    const vm = toDashboardViewModel('', 'alice', '', past, 'warning')
    expect(vm.expiry?.buttonTitle).toContain('expired')
    expect(vm.expiry?.modalLabel).toContain('expired')
  })

  test('avatarUrl is null when empty string is passed', () => {
    const vm = toDashboardViewModel('', 'alice', '', null, null)
    expect(vm.avatarUrl).toBeNull()
  })

  test('avatarUrl is preserved when non-empty', () => {
    const vm = toDashboardViewModel('', 'alice', 'https://example.com/avatar.png', null, null)
    expect(vm.avatarUrl).toBe('https://example.com/avatar.png')
  })
})
```

- [ ] **Step 3: Run tests — expect failures**

```bash
bun test tests/unit/templates/page-template.test.ts
```

Expected: type errors because `renderDashboard` signature hasn't changed yet

- [ ] **Step 4: Update `src/templates/page-template.ts`**

Add `toDashboardViewModel` and update `renderDashboard` signature. The `SEVERITY_COLOR`, `formatExpiryDate`, and `daysUntilExpiry` helpers stay in the file (used by `toDashboardViewModel`). Import the new types:

```typescript
import type { PatExpirySeverity } from '../services/pat-expiry-service.ts'
import { escapeHtml } from './formatters.ts'
import { DASHBOARD_CSS } from './styles.ts'
import type { DashboardViewModel, ExpiryBannerViewModel } from './types.ts'
```

Add before `renderSetupPage`:

```typescript
const SEVERITY_COLOR: Record<PatExpirySeverity, string> = {
  info: '#388bfd',
  notice: '#d29922',
  warning: '#f85149',
}

function formatExpiryDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysUntilExpiry(d: Date): number {
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}

export function toDashboardViewModel(
  cardsHtml: string,
  username: string,
  avatarUrl: string,
  expiresAt: Date | null,
  severity: PatExpirySeverity | null,
): DashboardViewModel {
  let expiry: ExpiryBannerViewModel | null = null
  if (expiresAt !== null && severity !== null) {
    const color = SEVERITY_COLOR[severity]
    const days = daysUntilExpiry(expiresAt)
    const dateStr = formatExpiryDate(expiresAt)
    const daysLabel = days <= 0 ? 'expired' : `in ${days} day${days === 1 ? '' : 's'}`
    expiry = {
      color,
      buttonTitle: `Token ${daysLabel} (${dateStr})`,
      modalLabel:
        days <= 0
          ? 'Your token has expired'
          : `Your token expires on ${dateStr} (in ${days} day${days === 1 ? '' : 's'})`,
    }
  }
  return {
    cardsHtml,
    username,
    avatarUrl: avatarUrl || null,
    expiry,
  }
}
```

Change `renderDashboard` signature and body to use `DashboardViewModel`:

```typescript
export function renderDashboard(vm: DashboardViewModel): string {
  return `<!DOCTYPE html><html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="htmx-config" content='{"includeIndicatorStyles":false}'>
  <title>GitHub Dashboard</title>
  <link rel="icon" type="image/png" href="${FAVICON_B64}">
  <style>${DASHBOARD_CSS}</style>
  <script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/idiomorph@0.7.4/dist/idiomorph-ext.js" crossorigin="anonymous"></script>
</head><body hx-ext="morph">
  <header style="background:#161b22;border-bottom:1px solid #30363d;height:56px;
                 display:flex;align-items:center;padding:0 20px;gap:10px;
                 position:sticky;top:0;z-index:100">
    <svg width="20" height="20" viewBox="0 0 16 16" fill="#e6edf3" style="flex-shrink:0">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
    <span style="font-size:15px;font-weight:600">Dashboard</span>
    <div style="flex:1"></div>
    <button class="btn-ghost"
            hx-get="/api/cards" hx-target="#cards" hx-swap="morph:innerHTML"
            hx-on::after-request="htmx.trigger(document.body,'cardsChanged')">
      Refresh
    </button>
    <button class="btn-primary repo-add-btn"
            hx-get="/api/modal/repos" hx-target="#modal" hx-swap="innerHTML">
      + Add repo
    </button>
    ${vm.avatarUrl ? `<img src="${escapeHtml(vm.avatarUrl)}" alt="${escapeHtml(vm.username)}" width="24" height="24" style="border-radius:50%;flex-shrink:0">` : ''}
    <span style="font-size:13px;color:#8b949e">${escapeHtml(vm.username)}</span>
    <form method="POST" action="/api/auth" style="margin:0">
      <input type="hidden" name="_method" value="DELETE">
      <button type="submit"
              style="background:transparent;border:none;color:#6e7681;cursor:pointer;font-size:12px">
        Sign out
      </button>
    </form>
    ${
      vm.expiry
        ? `<button
      onclick="document.getElementById('pat-modal').style.display='flex'"
      title="${vm.expiry.buttonTitle}"
      style="background:transparent;border:none;cursor:pointer;padding:2px;display:flex;
             align-items:center;color:${vm.expiry.color};flex-shrink:0"
      aria-label="PAT expiry warning">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 1.5a6.5 6.5 0 110 13 6.5 6.5 0 010-13zM7.25 4v5.25l3.5 2.1.75-1.23-2.75-1.65V4h-1.5z"/>
      </svg>
    </button>`
        : ''
    }
  </header>
  <main style="padding:20px 24px">
    <div id="cards"
         hx-get="/api/cards"
         hx-trigger="every 10s, cardsChanged from:body"
         hx-swap="morph:innerHTML">
      ${vm.cardsHtml}
    </div>
  </main>
  ${
    vm.expiry
      ? `<div id="pat-modal"
    style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;
           align-items:center;justify-content:center"
    onclick="if(event.target===this)this.style.display='none'">
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;width:100%;
                max-width:480px;margin:16px;padding:24px">
      <div style="font-size:16px;font-weight:600;margin-bottom:16px">Personal Access Token</div>
      <p style="color:${vm.expiry.color};font-size:13px;margin:0 0 16px">${vm.expiry.modalLabel}</p>
      <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer"
         style="color:#388bfd;font-size:13px;display:block;margin-bottom:20px">
        Create a new token on GitHub →
      </a>
      <form hx-post="/api/auth" hx-target="body">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">
          New Personal Access Token
        </label>
        <input name="pat" type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" required
               style="width:100%;background:#0d1117;border:1px solid #30363d;border-radius:6px;
                      padding:9px 12px;color:#e6edf3;font-size:13px;font-family:monospace;
                      outline:none;margin-bottom:12px"/>
        <button type="submit" class="btn-primary" style="width:100%;padding:10px">
          Renew Token
        </button>
      </form>
    </div>
  </div>`
      : ''
  }
  <div id="modal"></div>
  <div id="countdown" title="Auto-Refresh Countdown"
       style="position:fixed;bottom:16px;right:16px;width:36px;height:36px;border-radius:50%;
              background:conic-gradient(#2f81f7 var(--cd,100%),#21262d 0%);
              z-index:50;display:flex;align-items:center;justify-content:center;pointer-events:none">
    <div style="width:28px;height:28px;border-radius:50%;background:#0d1117"></div>
  </div>
  <script>${CLIENT_SCRIPT}</script>
</body></html>`
}
```

- [ ] **Step 5: Update `src/routes/card-route.ts`**

Add import for `toDashboardViewModel`:

```typescript
import { renderDashboard, toDashboardViewModel } from '../templates/page-template.ts'
```

Replace the `renderDashboard(...)` call (lines 69–77) with:

```typescript
return html(
  renderDashboard(
    toDashboardViewModel(
      renderCards(vms),
      token.username,
      token.avatarUrl,
      token.expiresAt instanceof Date ? token.expiresAt : null,
      severity,
    ),
  ),
)
```

- [ ] **Step 6: Run tests**

```bash
bun test tests/unit/templates/page-template.test.ts
```

Expected: all tests pass

- [ ] **Step 7: Typecheck + lint**

```bash
bun x tsc --noEmit && bun run check
```

Expected: no errors

- [ ] **Step 8: Run full unit suite**

```bash
bun test tests/unit
```

Expected: all tests pass

- [ ] **Step 9: Run E2E tests**

```bash
bun run test:e2e
```

Expected: all Playwright tests pass

- [ ] **Step 10: Commit**

```bash
git add src/templates/types.ts src/templates/page-template.ts src/routes/card-route.ts tests/unit/templates/page-template.test.ts
git commit -m "refactor(templates): extract dashboard ViewModel and remove IIFE logic"
```
