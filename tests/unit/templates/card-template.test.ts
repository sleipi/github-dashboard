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
