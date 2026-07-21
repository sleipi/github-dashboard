import { describe, expect, test } from 'bun:test'
import type { Activity } from '../../../src/db/types.ts'
import type { CardData } from '../../../src/services/card-service.ts'
import {
  renderCard,
  renderCardError,
  renderCards,
  sortCardsByActivity,
  toCardViewModel,
} from '../../../src/templates/card-template.ts'
import { DASHBOARD_CSS } from '../../../src/templates/styles.ts'
import type { CardViewModel } from '../../../src/templates/types.ts'

const emptyCardData = (fullName: string): CardData => ({
  fullName,
  cache: {
    fullName,
    lastCommitAt: new Date('2026-06-20T10:00:00Z'),
    prTotal: 0,
    dependabotCount: 0,
    cachedAt: new Date(),
  },
  prs: [],
  securityCounts: {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    overdueSeverities: new Set(),
  },
  mostRecentActivityAt: new Date('2026-06-20T10:00:00Z'),
})

describe('toCardViewModel', () => {
  test('splits fullName into owner and name', () => {
    const vm = toCardViewModel(emptyCardData('alice/my-repo'), [])
    expect(vm.owner).toBe('alice')
    expect(vm.name).toBe('my-repo')
  })

  test('noPrs is true when prs array is empty', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'), [])
    expect(vm.noPrs).toBe(true)
    expect(vm.hasPrs).toBe(false)
  })

  test('secHasAlerts is false when all severity counts are 0', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'), [])
    expect(vm.secHasAlerts).toBe(false)
    expect(vm.secCritical).toBe(0)
    expect(vm.secHigh).toBe(0)
    expect(vm.secMedium).toBe(0)
    expect(vm.secLow).toBe(0)
  })

  test('secHasAlerts is true when any severity count > 0', () => {
    const data: CardData = {
      ...emptyCardData('alice/alpha'),
      securityCounts: {
        critical: 0,
        high: 3,
        medium: 0,
        low: 0,
        overdueSeverities: new Set(),
      },
    }
    const vm = toCardViewModel(data, [])
    expect(vm.secHasAlerts).toBe(true)
    expect(vm.secHigh).toBe(3)
  })

  test('secScopeAvailable is false when dependabotCount is null', () => {
    const data: CardData = {
      ...emptyCardData('alice/alpha'),
      cache: { ...emptyCardData('alice/alpha').cache, dependabotCount: null },
    }
    const vm = toCardViewModel(data, [])
    expect(vm.secScopeAvailable).toBe(false)
  })

  test('secScopeAvailable is true when dependabotCount is 0', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'), [])
    expect(vm.secScopeAvailable).toBe(true)
  })

  test('secCriticalOverdue is true when critical is in overdueSeverities', () => {
    const data: CardData = {
      ...emptyCardData('alice/alpha'),
      securityCounts: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        overdueSeverities: new Set(['critical'] as const),
      },
    }
    const vm = toCardViewModel(data, [])
    expect(vm.secCriticalOverdue).toBe(true)
    expect(vm.secHighOverdue).toBe(false)
  })

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
      cache: {
        ...emptyCardData('alice/fresh').cache,
        lastCommitAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    }
    const vm = toCardViewModel(data, [])
    expect(vm.borderStyle).toContain('border-color:#2ea043')
    expect(vm.borderStyle).toContain('box-shadow')
  })

  test('borderStyle has medium-green border for a commit < 1 day ago', () => {
    const data: CardData = {
      ...emptyCardData('alice/today'),
      cache: {
        ...emptyCardData('alice/today').cache,
        lastCommitAt: new Date(Date.now() - 2 * 3_600_000),
      },
    }
    const vm = toCardViewModel(data, [])
    expect(vm.borderStyle).toContain('border-color:#1a6b32')
  })

  test('borderStyle has dark-green border for a commit < 3 days ago', () => {
    const data: CardData = {
      ...emptyCardData('alice/recent'),
      cache: {
        ...emptyCardData('alice/recent').cache,
        lastCommitAt: new Date(Date.now() - 2 * 86_400_000),
      },
    }
    const vm = toCardViewModel(data, [])
    expect(vm.borderStyle).toContain('border-color:#1a4228')
  })

  test('borderStyle has grey border for a commit > 3 days ago', () => {
    const data: CardData = {
      ...emptyCardData('alice/old'),
      cache: {
        ...emptyCardData('alice/old').cache,
        lastCommitAt: new Date(Date.now() - 7 * 86_400_000),
      },
    }
    const vm = toCardViewModel(data, [])
    expect(vm.borderStyle).toBe('border-color:#30363d')
  })

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
})

describe('ActivityItemViewModel — ageBgStyle', () => {
  const makeActivity = (occurredAt: Date): Activity => ({
    id: 1,
    repoFullName: 'alice/alpha',
    eventType: 'pr_merged',
    actor: 'bob',
    subject: 'merged #1',
    linkUrl: 'https://github.com/alice/alpha/pull/1',
    occurredAt,
    recordedAt: new Date(),
    githubEventId: 'evt_1',
  })

  test('ageBgStyle is empty for recent activity (3 days old)', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'), [
      makeActivity(new Date(Date.now() - 3 * 86_400_000)),
    ])
    expect(vm.activities[0]?.ageBgStyle).toBe('')
  })

  test('ageBgStyle contains orange rgba for activity older than 7 days', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'), [
      makeActivity(new Date(Date.now() - 10 * 86_400_000)),
    ])
    expect(vm.activities[0]?.ageBgStyle).toContain('rgba(248,113,113,')
  })

  test('ageBgStyle contains green rgba for activity less than 6 hours old', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'), [
      makeActivity(new Date(Date.now() - 2 * 3_600_000)),
    ])
    expect(vm.activities[0]?.ageBgStyle).toContain('rgba(34,197,94,')
  })
})

describe('renderCard — activity timeAgo', () => {
  test('renders timeAgo text inline (not only in title attr) for activity items', () => {
    const activity: Activity = {
      id: 1,
      repoFullName: 'alice/alpha',
      eventType: 'pr_merged',
      actor: 'bob',
      subject: 'merged #1',
      linkUrl: 'https://github.com/alice/alpha/pull/1',
      occurredAt: new Date(Date.now() - 5 * 3_600_000),
      recordedAt: new Date(),
      githubEventId: 'evt_1',
    }
    const html = renderCard(toCardViewModel(emptyCardData('alice/alpha'), [activity]))
    expect(html).toContain('h ago')
    const titleAttr = html.match(/title="[^"]*"/)
    const nonTitleOccurrences = html.replace(titleAttr?.[0] ?? '', '')
    expect(nonTitleOccurrences).toContain('h ago')
  })
})

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
    expect(vm.prs[0]?.highlightStyle).toBe('')
  })

  test('highlightStyle contains rgba for a brand-new PR', () => {
    const pr = basePr({ createdAt: new Date() })
    const vm = toCardViewModel({ ...emptyCardData('alice/alpha'), prs: [pr] }, [])
    expect(vm.prs[0]?.highlightStyle).toContain('rgba(34,197,94,')
  })

  test('highlightStyle contains orange rgba for a PR older than 7 days', () => {
    const pr = basePr({ createdAt: new Date(Date.now() - 10 * 86_400_000) })
    const vm = toCardViewModel({ ...emptyCardData('alice/alpha'), prs: [pr] }, [])
    expect(vm.prs[0]?.highlightStyle).toContain('rgba(248,113,113,')
  })

  test('opacity is lower for a 3-hour-old PR than a brand-new one', () => {
    const newPr = basePr({ createdAt: new Date(), number: 1, prUrl: 'u1' })
    const oldPr = basePr({
      createdAt: new Date(Date.now() - 3 * 3_600_000),
      number: 2,
      prUrl: 'u2',
    })
    const vm = toCardViewModel({ ...emptyCardData('alice/alpha'), prs: [newPr, oldPr] }, [])
    const extract = (style: string) =>
      Number.parseFloat(style.match(/rgba\(34,197,94,([^)]+)\)/)?.[1] ?? '0')
    expect(extract(vm.prs[0]?.highlightStyle ?? '')).toBeGreaterThan(
      extract(vm.prs[1]?.highlightStyle ?? ''),
    )
  })
})

describe('renderCard', () => {
  test('contains repo link', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'), [])
    const html = renderCard(vm)
    expect(html).toContain('https://github.com/alice/alpha')
  })

  test('contains HTMX refresh button', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'), [])
    const html = renderCard(vm)
    expect(html).toContain('hx-get="/api/card/alice/alpha"')
  })

  test('shows green no-alerts badge when secScopeAvailable and no alerts', () => {
    const html = renderCard(toCardViewModel(emptyCardData('alice/no-alerts'), []))
    expect(html).toContain('No Alerts ✓')
  })

  test('shows dash badge when security scope not available', () => {
    const data: CardData = {
      ...emptyCardData('alice/no-scope'),
      cache: { ...emptyCardData('alice/no-scope').cache, dependabotCount: null },
    }
    const html = renderCard(toCardViewModel(data, []))
    expect(html).toContain('Security Alerts —')
  })

  test('shows HTMX security badge button when alerts present', () => {
    const data: CardData = {
      ...emptyCardData('alice/with-alerts'),
      securityCounts: {
        critical: 2,
        high: 0,
        medium: 0,
        low: 0,
        overdueSeverities: new Set(),
      },
    }
    const html = renderCard(toCardViewModel(data, []))
    expect(html).toContain('hx-get="/api/security/alice/with-alerts"')
    expect(html).toContain('Critical')
    expect(html).toContain('2')
  })

  test('shows overdue warning icon when severity is overdue', () => {
    const data: CardData = {
      ...emptyCardData('alice/overdue'),
      securityCounts: {
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        overdueSeverities: new Set(['critical'] as const),
      },
    }
    const html = renderCard(toCardViewModel(data, []))
    expect(html).toContain('M6.457 1.047') // warning triangle SVG path
  })

  test('gear icon links to SLA settings', () => {
    // SLA button lives in the global page header, not on individual cards
    const html = renderCard(toCardViewModel(emptyCardData('alice/alpha'), []))
    expect(html).not.toContain('hx-get="/api/settings/sla"')
  })

  test('shows more-PRs button when more than MAX_PRS_ON_CARD exist', () => {
    const prs = Array.from({ length: 6 }, (_, i) => ({
      repoFullName: 'alice/busy',
      number: i + 1,
      title: `PR ${i + 1}`,
      draft: false,
      ciStatus: 'unknown' as const,
      prUrl: `https://github.com/alice/busy/pull/${i + 1}`,
      creator: 'dev',
      labels: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    const data: CardData = { ...emptyCardData('alice/busy'), prs }
    const html = renderCard(toCardViewModel(data, []))
    expect(html).toContain('hx-get="/api/prs/alice/busy"')
    expect(html).toContain('more PR')
  })
})

describe('DASHBOARD_CSS', () => {
  test('htmx-indicator has pointer-events:none so invisible overlay does not block clicks', () => {
    const rule = DASHBOARD_CSS.match(/\.htmx-indicator\s*\{[^}]+\}/)?.[0] ?? ''
    expect(rule).toContain('pointer-events: none')
  })
})

describe('renderCards', () => {
  test('shows empty state when no cards', () => {
    expect(renderCards([])).toContain('No repos pinned yet')
  })

  test('renders card html for each viewmodel', () => {
    const vms = [
      toCardViewModel(emptyCardData('alice/alpha'), []),
      toCardViewModel(emptyCardData('alice/beta'), []),
    ]
    const html = renderCards(vms)
    expect(html).toContain('alice/alpha')
    expect(html).toContain('alice/beta')
  })

  test('renderCards uses auto-fill grid', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'), [])
    const html = renderCards([vm])
    expect(html).toContain('repeat(auto-fill,minmax(max(22%,340px),1fr))')
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
})

describe('renderCardError', () => {
  test('renders an error card containing the repo fullName and message', () => {
    const html = renderCardError('alice/alpha', 'GitHub unavailable')
    expect(html).toContain('alice/alpha')
    expect(html).toContain('GitHub unavailable')
  })

  test('renders a red border on the error card', () => {
    const html = renderCardError('alice/alpha', 'some error')
    expect(html).toContain('#f85149')
  })

  test('escapes HTML in the error message', () => {
    const html = renderCardError('alice/alpha', '<script>alert(1)</script>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('escapes HTML in the fullName', () => {
    const html = renderCardError('<evil>/repo', 'error')
    expect(html).not.toContain('<evil>')
    expect(html).toContain('&lt;evil&gt;')
  })
})

describe('toCardViewModel — mostRecentActivityAt', () => {
  test('carries the epoch ms of CardData.mostRecentActivityAt', () => {
    const data = { ...emptyCardData('alice/alpha'), mostRecentActivityAt: new Date('2026-05-01') }
    const vm = toCardViewModel(data, [])
    expect(vm.mostRecentActivityAt).toBe(new Date('2026-05-01').getTime())
  })

  test('is null when CardData.mostRecentActivityAt is null', () => {
    const data = { ...emptyCardData('alice/alpha'), mostRecentActivityAt: null }
    const vm = toCardViewModel(data, [])
    expect(vm.mostRecentActivityAt).toBeNull()
  })
})

describe('sortCardsByActivity', () => {
  function makeVm(fullName: string, mostRecentActivityAt: number | null): CardViewModel {
    return { ...toCardViewModel(emptyCardData(fullName), []), mostRecentActivityAt }
  }

  test('sorts descending by mostRecentActivityAt (newest first)', () => {
    const older = makeVm('alice/older', 1000)
    const newer = makeVm('alice/newer', 2000)

    const sorted = sortCardsByActivity([older, newer])

    expect(sorted.map((v) => v.fullName)).toEqual(['alice/newer', 'alice/older'])
  })

  test('sorts null last', () => {
    const withDate = makeVm('alice/with-date', 1000)
    const withoutDate = makeVm('alice/no-date', null)

    const sorted = sortCardsByActivity([withoutDate, withDate])

    expect(sorted.map((v) => v.fullName)).toEqual(['alice/with-date', 'alice/no-date'])
  })

  test('returns empty array for empty input', () => {
    expect(sortCardsByActivity([])).toEqual([])
  })

  test('returns single-element array unchanged', () => {
    const vm = makeVm('alice/solo', 500)
    expect(sortCardsByActivity([vm])).toEqual([vm])
  })

  test('does not mutate the input array', () => {
    const older = makeVm('alice/older', 1000)
    const newer = makeVm('alice/newer', 2000)
    const input = [older, newer]

    sortCardsByActivity(input)

    expect(input).toEqual([older, newer])
  })

  test('preserves relative order for cards with identical mostRecentActivityAt (stable sort)', () => {
    const first = makeVm('alice/first', 1000)
    const second = makeVm('alice/second', 1000)
    const third = makeVm('alice/third', 1000)

    const sorted = sortCardsByActivity([first, second, third])

    expect(sorted.map((v) => v.fullName)).toEqual(['alice/first', 'alice/second', 'alice/third'])
  })
})
