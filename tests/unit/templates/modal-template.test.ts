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
  test('setzt isPinned korrekt wenn Repo gepinnt ist', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), true)
    expect(vm.isPinned).toBe(true)
  })

  test('setzt isPinned korrekt wenn Repo nicht gepinnt ist', () => {
    const vm = toRepoListItem(makeRepo('alice/foo'), false)
    expect(vm.isPinned).toBe(false)
  })

  test('übergibt isPrivate und language', () => {
    const vm = toRepoListItem(makeRepo('alice/priv', { isPrivate: true, language: 'Go' }), false)
    expect(vm.isPrivate).toBe(true)
    expect(vm.language).toBe('Go')
  })
})

describe('renderRepoModal', () => {
  const repo = makeRepo('alice/foo')
  const pinnedRepo = makeRepo('alice/bar')

  test('gepinntes Repo hat data-checked="1"', () => {
    const html = renderRepoModal([pinnedRepo], new Set(['alice/bar']))
    expect(html).toContain('data-checked="1"')
  })

  test('ungepinntes Repo hat data-checked="0"', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).toContain('data-checked="0"')
  })

  test('gepinntes Repo enthält SVG-Häkchen', () => {
    const html = renderRepoModal([pinnedRepo], new Set(['alice/bar']))
    expect(html).toContain('<svg')
    expect(html).toContain('stroke="white"')
  })

  test('ungepinntes Repo enthält kein SVG-Häkchen', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).not.toContain('<svg')
  })

  test('gepinntes Repo hat grünen Hintergrund im check-div', () => {
    const html = renderRepoModal([pinnedRepo], new Set(['alice/bar']))
    expect(html).toContain('background:#238636')
  })

  test('ungepinntes Repo hat transparenten Hintergrund im check-div', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).toContain('background:transparent')
  })

  test('Reponame erscheint im HTML', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).toContain('alice/foo')
  })

  test('onclick ruft _toggleCheck auf', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).toContain('_toggleCheck(this)')
  })

  test('Suchfeld ist vorhanden', () => {
    const html = renderRepoModal([repo], new Set())
    expect(html).toContain('id="repo-search"')
  })

  test('Privates Repo zeigt Privat-Badge', () => {
    const privateRepo = makeRepo('alice/secret', { isPrivate: true })
    const html = renderRepoModal([privateRepo], new Set())
    expect(html).toContain('Privat')
  })

  test('begrenzt Ausgabe auf 100 Repos', () => {
    const repos = Array.from({ length: 150 }, (_, i) => makeRepo(`alice/repo-${i}`))
    const html = renderRepoModal(repos, new Set())
    const matches = html.match(/data-repo-name=/g) ?? []
    expect(matches.length).toBe(100)
  })
})
