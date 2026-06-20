import { afterEach, describe, expect, test } from 'bun:test'
import { createSqliteRepos } from '../../../src/db/sqlite-repository.ts'
import type { PullRequest } from '../../../src/db/types.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

const makePr = (number: number): PullRequest => ({
  repoFullName: 'alice/alpha',
  number,
  title: `PR #${number}`,
  draft: false,
  ciStatus: 'success',
  prUrl: `https://github.com/alice/alpha/pull/${number}`,
  creator: 'bob',
  labels: [{ name: 'bug', color: 'f85149' }],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
})

describe('PrRepo', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('getCache returns null for unknown repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    expect(repos.pullRequests.getCache('alice/alpha')).toBeNull()
    repos.close()
  })

  test('upsertCache stores and retrieves cache', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    const now = new Date('2026-06-20T12:00:00Z')
    repos.pullRequests.upsertCache('alice/alpha', {
      lastCommitAt: now,
      prTotal: 3,
      dependabotCount: 5,
    })

    const cache = repos.pullRequests.getCache('alice/alpha')
    expect(cache?.prTotal).toBe(3)
    expect(cache?.dependabotCount).toBe(5)
    expect(cache?.lastCommitAt?.toISOString()).toBe(now.toISOString())
    repos.close()
  })

  test('upsertPrs replaces existing PRs for a repo', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.pullRequests.upsertPrs('alice/alpha', [makePr(1), makePr(2)])
    repos.pullRequests.upsertPrs('alice/alpha', [makePr(3)]) // replaces

    const prs = repos.pullRequests.getPrs('alice/alpha')
    expect(prs).toHaveLength(1)
    expect(prs[0]?.number).toBe(3)
    repos.close()
  })

  test('upsertPrs preserves labels as JSON', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    repos.pullRequests.upsertPrs('alice/alpha', [makePr(1)])
    const pr = repos.pullRequests.getPrs('alice/alpha')[0]

    expect(pr?.labels).toEqual([{ name: 'bug', color: 'f85149' }])
    repos.close()
  })

  test('upsertPrs for different repos are independent', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-pr-')
    cleanup.push(dir)
    const repos = createSqliteRepos(dbPath)

    const prB = { ...makePr(99), repoFullName: 'alice/beta' }
    repos.pullRequests.upsertPrs('alice/alpha', [makePr(1)])
    repos.pullRequests.upsertPrs('alice/beta', [prB])

    expect(repos.pullRequests.getPrs('alice/alpha')).toHaveLength(1)
    expect(repos.pullRequests.getPrs('alice/beta')).toHaveLength(1)
    repos.close()
  })
})
