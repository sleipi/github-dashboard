import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

describe('CardRepo', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('getPinned returns empty array initially', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    expect(repos.cards.getPinned()).toEqual([])
    repos.close()
  })

  test('pin adds a repo and isPinned reflects it', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.cards.pin('alice/alpha')

    expect(repos.cards.isPinned('alice/alpha')).toBe(true)
    expect(repos.cards.isPinned('alice/beta')).toBe(false)
    expect(repos.cards.getPinned()).toHaveLength(1)
    repos.close()
  })

  test('pin is idempotent', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.cards.pin('alice/alpha')
    repos.cards.pin('alice/alpha')

    expect(repos.cards.getPinned()).toHaveLength(1)
    repos.close()
  })

  test('unpin removes a repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.cards.pin('alice/alpha')
    repos.cards.unpin('alice/alpha')

    expect(repos.cards.isPinned('alice/alpha')).toBe(false)
    repos.close()
  })

  test('reorder changes sort_order', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.cards.pin('alice/beta')
    repos.cards.pin('alice/alpha')
    repos.cards.reorder(['alice/alpha', 'alice/beta'])

    const pinned = repos.cards.getPinned()
    expect(pinned.map((r) => r.fullName)).toEqual(['alice/alpha', 'alice/beta'])
    repos.close()
  })

  test('getPinned sorts by sort_order ascending', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-cards-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.cards.pin('first')
    repos.cards.pin('second')
    repos.cards.pin('third')

    const names = repos.cards.getPinned().map((r) => r.fullName)
    expect(names).toEqual(['first', 'second', 'third'])
    repos.close()
  })
})
