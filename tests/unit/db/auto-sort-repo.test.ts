import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

describe('AutoSortRepo', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('isEnabled defaults to false when no setting stored', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auto-sort-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    expect(repos.autoSort.isEnabled()).toBe(false)
    repos.close()
  })

  test('setEnabled(true) then isEnabled() returns true', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auto-sort-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.autoSort.setEnabled(true)

    expect(repos.autoSort.isEnabled()).toBe(true)
    repos.close()
  })

  test('setEnabled(false) after true flips back', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auto-sort-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.autoSort.setEnabled(true)
    repos.autoSort.setEnabled(false)

    expect(repos.autoSort.isEnabled()).toBe(false)
    repos.close()
  })

  test('value persists across repo re-open on same db path', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-auto-sort-')
    cleanup.push(dir)
    const repos1 = createSqliteRepos(dbPath)
    repos1.autoSort.setEnabled(true)
    repos1.close()

    const repos2 = createSqliteRepos(dbPath)
    expect(repos2.autoSort.isEnabled()).toBe(true)
    repos2.close()
  })
})
