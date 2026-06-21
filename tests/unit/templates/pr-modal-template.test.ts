import { describe, expect, test } from 'bun:test'
import type { PullRequest } from '../../../src/db/types.ts'
import { renderPrModal } from '../../../src/templates/pr-modal-template.ts'

const makePr = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  repoFullName: 'alice/alpha',
  number: 1,
  title: 'Fix the thing',
  draft: false,
  ciStatus: 'success',
  prUrl: 'https://github.com/alice/alpha/pull/1',
  creator: 'bob',
  labels: [],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  ...overrides,
})

describe('renderPrModal', () => {
  test('renders the repo fullName in the modal header', () => {
    const html = renderPrModal('alice/alpha', [])
    expect(html).toContain('alice/alpha')
  })

  test('renders PR number and title', () => {
    const html = renderPrModal('alice/alpha', [makePr({ number: 42, title: 'Fix the bug' })])
    expect(html).toContain('#42')
    expect(html).toContain('Fix the bug')
  })

  test('renders PR creator', () => {
    const html = renderPrModal('alice/alpha', [makePr({ creator: 'charlie' })])
    expect(html).toContain('charlie')
  })

  test('renders a link to the PR URL', () => {
    const url = 'https://github.com/alice/alpha/pull/99'
    const html = renderPrModal('alice/alpha', [makePr({ prUrl: url })])
    expect(html).toContain(url)
  })

  test('shows the Draft badge for draft PRs', () => {
    const html = renderPrModal('alice/alpha', [makePr({ draft: true })])
    expect(html).toContain('Draft')
  })

  test('does not show the Draft badge for non-draft PRs', () => {
    const html = renderPrModal('alice/alpha', [makePr({ draft: false })])
    expect(html).not.toContain('Draft')
  })

  test('renders labels with their hex color', () => {
    const html = renderPrModal('alice/alpha', [
      makePr({ labels: [{ name: 'bug', color: 'f85149' }] }),
    ])
    expect(html).toContain('bug')
    expect(html).toContain('#f85149')
  })

  test('escapes HTML in the PR title', () => {
    const html = renderPrModal('alice/alpha', [makePr({ title: '<script>alert(1)</script>' })])
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('escapes HTML in the PR creator name', () => {
    const html = renderPrModal('alice/alpha', [makePr({ creator: '<evil>' })])
    expect(html).not.toContain('<evil>')
    expect(html).toContain('&lt;evil&gt;')
  })

  test('escapes HTML in the label name', () => {
    const html = renderPrModal('alice/alpha', [
      makePr({ labels: [{ name: '<xss>', color: 'ffffff' }] }),
    ])
    expect(html).not.toContain('<xss>')
    expect(html).toContain('&lt;xss&gt;')
  })

  test('renders multiple PRs', () => {
    const html = renderPrModal('alice/alpha', [
      makePr({ number: 1, title: 'First PR' }),
      makePr({ number: 2, title: 'Second PR' }),
    ])
    expect(html).toContain('First PR')
    expect(html).toContain('Second PR')
  })
})
