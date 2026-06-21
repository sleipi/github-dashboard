import { createSqliteRepos } from '../../src/db/sqlite-repository.ts'
import type { PullRequest } from '../../src/db/types.ts'

const TEST_PAT = 'ghp_testtoken000000000000000000000000'
const TEST_USER = 'testuser'
const TEST_AVATAR = 'https://avatars.githubusercontent.com/u/1?v=4'

export function seedTestDb(dbPath: string): void {
  const repos = createSqliteRepos(dbPath)

  // Auth
  repos.auth.saveToken({ pat: TEST_PAT, username: TEST_USER, avatarUrl: TEST_AVATAR })

  // Gepinnte Repos
  repos.cards.pin('alice/awesome-project')
  repos.cards.pin('alice/another-repo')

  // Repo-Cache für awesome-project (7 PRs total, 6 werden auf der Card angezeigt)
  repos.pullRequests.upsertCache('alice/awesome-project', {
    lastCommitAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // vor 2h
    prTotal: 7,
    dependabotCount: 3,
  })

  const prs: PullRequest[] = [
    {
      repoFullName: 'alice/awesome-project',
      number: 42,
      title: 'feat: add dark mode support',
      draft: false,
      ciStatus: 'success',
      prUrl: 'https://github.com/alice/awesome-project/pull/42',
      creator: 'bob',
      labels: [{ name: 'enhancement', color: '238636' }],
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    },
    {
      repoFullName: 'alice/awesome-project',
      number: 41,
      title: 'fix: resolve memory leak in worker',
      draft: false,
      ciStatus: 'failure',
      prUrl: 'https://github.com/alice/awesome-project/pull/41',
      creator: 'carol',
      labels: [{ name: 'bug', color: 'f85149' }],
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      repoFullName: 'alice/awesome-project',
      number: 40,
      title: 'chore: update dependencies',
      draft: true,
      ciStatus: 'unknown',
      prUrl: 'https://github.com/alice/awesome-project/pull/40',
      creator: 'dave',
      labels: [],
      createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
    {
      repoFullName: 'alice/awesome-project',
      number: 39,
      title: 'feat: add keyboard shortcuts',
      draft: false,
      ciStatus: 'pending',
      prUrl: 'https://github.com/alice/awesome-project/pull/39',
      creator: 'eve',
      labels: [],
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    },
    {
      repoFullName: 'alice/awesome-project',
      number: 38,
      title: 'fix: correct pagination offset',
      draft: false,
      ciStatus: 'success',
      prUrl: 'https://github.com/alice/awesome-project/pull/38',
      creator: 'bob',
      labels: [],
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    },
    {
      repoFullName: 'alice/awesome-project',
      number: 37,
      title: 'refactor: extract auth helpers',
      draft: false,
      ciStatus: 'success',
      prUrl: 'https://github.com/alice/awesome-project/pull/37',
      creator: 'carol',
      labels: [],
      createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    },
    {
      repoFullName: 'alice/awesome-project',
      number: 36,
      title: 'feat: add export functionality',
      draft: false,
      ciStatus: 'unknown',
      prUrl: 'https://github.com/alice/awesome-project/pull/36',
      creator: 'dave',
      labels: [],
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
    },
  ]
  repos.pullRequests.upsertPrs('alice/awesome-project', prs)

  // Dependabot-History
  const now = new Date()
  repos.dependabot.maybeRecordSnapshot(
    'alice/awesome-project',
    5,
    new Date(now.getTime() - 8 * 86_400_000),
    0,
  )
  repos.dependabot.maybeRecordSnapshot('alice/awesome-project', 3, now, 0)

  // Repo-Cache für another-repo (keine PRs)
  repos.pullRequests.upsertCache('alice/another-repo', {
    lastCommitAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    prTotal: 0,
    dependabotCount: 0,
  })

  repos.close()
}

// Direkter Aufruf: bun run tests/e2e/seed-db.ts <dbPath>
const dbPath = process.argv[2]
if (dbPath) {
  seedTestDb(dbPath)
  console.log(`Seeded: ${dbPath}`)
}
