import { describe, expect, test } from 'bun:test'
import type { GitHubRepo } from '../../../src/github/github-client.ts'
import { renderRepoModal, toRepoListItem } from '../../../src/templates/modal-template.ts'

const makeRepo = (fullName: string, opts: Partial<GitHubRepo> = {}): GitHubRepo => {
  const [owner, name] = fullName.split('/') as [string, string]
  return {
    fullName,
    name,
    owner,
    isPrivate: false,
    language: 'TypeScript',
    stargazersCount: 0,
    updatedAt: '2026-01-01T00:00:00Z',
    ...opts,
  }
}

describe('toRepoListItem', () => {
  test('sets isPinned correctly when repo is pinned', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), true)
    expect(vm.isPinned).toBe(true)
  })

  test('sets isPinned correctly when repo is not pinned', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), false)
    expect(vm.isPinned).toBe(false)
  })

  test('passes isPrivate and language', () => {
    const vm = toRepoListItem(makeRepo('alice/priv', { isPrivate: true, language: 'Go' }), false)
    expect(vm.isPrivate).toBe(true)
    expect(vm.language).toBe('Go')
  })
})

describe('renderRepoModal', () => {
  const repo = makeRepo('alice/foo')
  const pinnedRepo = makeRepo('alice/bar')

  test('pinned repo has data-checked="1"', () => {
    const html = renderRepoModal([pinnedRepo], new Set(['alice/bar']))
    expect(html).toContain('data-checked="1"')
  })

  test('unpinned repo has data-checked="0"', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).toContain('data-checked="0"')
  })

  test('pinned repo contains SVG checkmark', () => {
    const html = renderRepoModal([pinnedRepo], new Set(['alice/bar']))
    expect(html).toContain('<svg')
    expect(html).toContain('stroke="white"')
  })

  test('unpinned repo contains no SVG checkmark', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).not.toContain('<svg')
  })

  test('pinned repo has green background on check div', () => {
    const html = renderRepoModal([pinnedRepo], new Set(['alice/bar']))
    expect(html).toContain('background:#238636')
  })

  test('unpinned repo has transparent background on check div', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).toContain('background:transparent')
  })

  test('repo name appears in HTML', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).toContain('alice/foo')
  })

  test('onclick calls _toggleCheck', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).toContain('_toggleCheck(this)')
  })

  test('search field is present', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).toContain('id="repo-search"')
  })

  test('private repo shows Private badge', () => {
    const privateRepo = makeRepo('alice/secret', { isPrivate: true })
    const html = renderRepoModal([privateRepo], new Set())
    expect(html).toContain('Private')
  })

  test('renders all repos without a cap', () => {
    const repos = Array.from({ length: 150 }, (_, i) => makeRepo(`alice/repo-${i}`))
    const html = renderRepoModal(repos, new Set())
    const matches = html.match(/data-repo-name=/g) ?? []
    expect(matches.length).toBe(150)
  })
})

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
