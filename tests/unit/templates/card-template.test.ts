import { describe, expect, test } from 'bun:test'
import type { CardData } from '../../../src/services/card-service.ts'
import { renderCard, renderCards, toCardViewModel } from '../../../src/templates/card-template.ts'

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
  trend: { week: null, month: null, sixMonths: null },
})

describe('toCardViewModel', () => {
  test('splits fullName into owner and name', () => {
    const vm = toCardViewModel(emptyCardData('alice/my-repo'))
    expect(vm.owner).toBe('alice')
    expect(vm.name).toBe('my-repo')
  })

  test('noPrs is true when prs array is empty', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'))
    expect(vm.noPrs).toBe(true)
    expect(vm.hasPrs).toBe(false)
  })

  test('depDisplay shows count when dependabotCount is 0', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'))
    expect(vm.depDisplay).toBe('0')
  })

  test('borderColor is bright green and has glow for a commit < 1 hour ago', () => {
    const recentData: CardData = {
      ...emptyCardData('alice/fresh'),
      cache: {
        ...emptyCardData('alice/fresh').cache,
        lastCommitAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      },
    }
    const vm = toCardViewModel(recentData)
    expect(vm.borderColor).toBe('#2ea043')
    expect(vm.borderGlow).toBe('0 0 0 1px #2ea043')
  })

  test('borderColor is medium green for a commit < 1 day ago', () => {
    const recentData: CardData = {
      ...emptyCardData('alice/today'),
      cache: {
        ...emptyCardData('alice/today').cache,
        lastCommitAt: new Date(Date.now() - 2 * 3_600_000), // 2 hours ago
      },
    }
    const vm = toCardViewModel(recentData)
    expect(vm.borderColor).toBe('#1a6b32')
    expect(vm.borderGlow).toBe('0 0 0 1px #1a6b3266')
  })

  test('borderColor is dark green for a commit < 3 days ago', () => {
    const recentData: CardData = {
      ...emptyCardData('alice/recent'),
      cache: {
        ...emptyCardData('alice/recent').cache,
        lastCommitAt: new Date(Date.now() - 2 * 86_400_000), // 2 days ago
      },
    }
    const vm = toCardViewModel(recentData)
    expect(vm.borderColor).toBe('#1a4228')
    expect(vm.borderGlow).toBe('')
  })

  test('borderColor is gray for a commit > 3 days ago', () => {
    const recentData: CardData = {
      ...emptyCardData('alice/old'),
      cache: {
        ...emptyCardData('alice/old').cache,
        lastCommitAt: new Date(Date.now() - 7 * 86_400_000), // 7 days ago
      },
    }
    const vm = toCardViewModel(recentData)
    expect(vm.borderColor).toBe('#30363d')
    expect(vm.borderGlow).toBe('')
  })

  test('borderColor is gray when lastCommitAt is null', () => {
    const recentData: CardData = {
      ...emptyCardData('alice/unknown'),
      cache: {
        ...emptyCardData('alice/unknown').cache,
        lastCommitAt: null,
      },
    }
    const vm = toCardViewModel(recentData)
    expect(vm.borderColor).toBe('#30363d')
    expect(vm.borderGlow).toBe('')
  })
})

describe('renderCard', () => {
  test('contains repo link', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'))
    const html = renderCard(vm)
    expect(html).toContain('https://github.com/alice/alpha')
  })

  test('contains HTMX refresh button', () => {
    const vm = toCardViewModel(emptyCardData('alice/alpha'))
    const html = renderCard(vm)
    expect(html).toContain('hx-get="/api/card/alice/alpha"')
  })
})

describe('renderCards', () => {
  test('shows empty state when no cards', () => {
    expect(renderCards([])).toContain('Noch keine Repos gepinnt')
  })

  test('renders card html for each viewmodel', () => {
    const vms = [
      toCardViewModel(emptyCardData('alice/alpha')),
      toCardViewModel(emptyCardData('alice/beta')),
    ]
    const html = renderCards(vms)
    expect(html).toContain('alice/alpha')
    expect(html).toContain('alice/beta')
  })
})
