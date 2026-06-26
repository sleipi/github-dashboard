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
    const vm = toActivityModalViewModel(
      'alice/alpha',
      [makeActivity({ actor: 'bob', subject: 'merged #1' })],
      new Date(),
    )
    // biome-ignore lint/style/noNonNullAssertion: test array with known length
    expect(vm.activities[0]!.text).toBe('bob merged #1')
  })

  test('timeAgo is pre-formatted relative timestamp', () => {
    const now = new Date('2026-06-22T12:00:00Z')
    const activity = makeActivity({ occurredAt: new Date('2026-06-22T10:00:00Z') })
    const vm = toActivityModalViewModel('alice/alpha', [activity], now)
    // biome-ignore lint/style/noNonNullAssertion: test array with known length
    expect(vm.activities[0]!.timeAgo).toContain('h ago')
  })

  test('linkUrl is passed through unchanged', () => {
    const url = 'https://github.com/alice/alpha/pull/99'
    const vm = toActivityModalViewModel('alice/alpha', [makeActivity({ linkUrl: url })], new Date())
    // biome-ignore lint/style/noNonNullAssertion: test array with known length
    expect(vm.activities[0]!.linkUrl).toBe(url)
  })

  test('fullName is set correctly', () => {
    const vm = toActivityModalViewModel('alice/alpha', [], new Date())
    expect(vm.fullName).toBe('alice/alpha')
  })
})

describe('ActivityModalItem — ageBgStyle', () => {
  test('ageBgStyle is empty for recent activity', () => {
    const now = new Date('2026-06-22T12:00:00Z')
    const activity = makeActivity({ occurredAt: new Date('2026-06-20T12:00:00Z') }) // 2 days old
    const vm = toActivityModalViewModel('alice/alpha', [activity], now)
    // biome-ignore lint/style/noNonNullAssertion: test array with known length
    expect(vm.activities[0]!.ageBgStyle).toBe('')
  })

  test('ageBgStyle contains orange rgba for activity older than 7 days', () => {
    const now = new Date('2026-06-22T12:00:00Z')
    const activity = makeActivity({ occurredAt: new Date('2026-06-10T12:00:00Z') }) // 12 days old
    const vm = toActivityModalViewModel('alice/alpha', [activity], now)
    // biome-ignore lint/style/noNonNullAssertion: test array with known length
    expect(vm.activities[0]!.ageBgStyle).toContain('rgba(248,113,113,')
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
