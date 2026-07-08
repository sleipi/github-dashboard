import { createSqliteRepos } from '../../src/db/sqlite-repository.ts'
import type { Activity, PullRequest } from '../../src/db/types.ts'

const TEST_PAT = 'ghp_testtoken000000000000000000000000'
const TEST_USER = 'testuser'
const TEST_AVATAR = 'https://avatars.githubusercontent.com/u/1?v=4'

export function seedTestDb(dbPath: string, opts: { patExpiresAt?: Date } = {}): void {
  const repos = createSqliteRepos(dbPath)

  // Auth
  repos.auth.saveToken({
    pat: TEST_PAT,
    username: TEST_USER,
    avatarUrl: TEST_AVATAR,
    expiresAt: opts.patExpiresAt ?? null,
  })

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

  // Activity data for awesome-project
  const activities: Array<Omit<Activity, 'id'>> = [
    {
      repoFullName: 'alice/awesome-project',
      eventType: 'pr_merged',
      actor: '@bob',
      subject: 'merged #35 — Add dark mode toggle',
      linkUrl: 'https://github.com/alice/awesome-project/pull/35',
      occurredAt: new Date(Date.now() - 30 * 60_000),
      recordedAt: new Date(),
      githubEventId: 'evt_001',
    },
    {
      repoFullName: 'alice/awesome-project',
      eventType: 'release',
      actor: '@alice',
      subject: 'released v2.1.0 — Spring release with many improvements',
      linkUrl: 'https://github.com/alice/awesome-project/releases/tag/v2.1.0',
      occurredAt: new Date(Date.now() - 2 * 60 * 60_000),
      recordedAt: new Date(),
      githubEventId: 'evt_002',
    },
    {
      repoFullName: 'alice/awesome-project',
      eventType: 'push',
      actor: '@carol',
      subject: 'pushed 2 commits to main',
      linkUrl: 'https://github.com/alice/awesome-project/compare/abc...def',
      occurredAt: new Date(Date.now() - 4 * 60 * 60_000),
      recordedAt: new Date(),
      githubEventId: 'evt_003',
    },
    {
      repoFullName: 'alice/awesome-project',
      eventType: 'pr_review_approved',
      actor: '@dave',
      subject: 'approved #42 — feat: add dark mode support',
      linkUrl: 'https://github.com/alice/awesome-project/pull/42',
      occurredAt: new Date(Date.now() - 5 * 60 * 60_000),
      recordedAt: new Date(),
      githubEventId: 'evt_004',
    },
    {
      repoFullName: 'alice/awesome-project',
      eventType: 'security_alert',
      actor: '@dependabot',
      subject: 'security: lodash — Prototype Pollution in the merge function',
      linkUrl: 'https://github.com/alice/awesome-project/security/dependabot/1',
      occurredAt: new Date(Date.now() - 6 * 60 * 60_000),
      recordedAt: new Date(),
      githubEventId: null,
    },
    {
      repoFullName: 'alice/awesome-project',
      eventType: 'security_alert',
      actor: '@dependabot',
      subject: 'security: moment — Path Traversal vulnerability',
      linkUrl: 'https://github.com/alice/awesome-project/security/dependabot/2',
      occurredAt: new Date(Date.now() - 7 * 60 * 60_000),
      recordedAt: new Date(),
      githubEventId: null,
    },
    {
      repoFullName: 'alice/awesome-project',
      eventType: 'security_alert',
      actor: '@dependabot',
      subject: 'security: axios — SSRF vulnerability',
      linkUrl: 'https://github.com/alice/awesome-project/security/dependabot/3',
      occurredAt: new Date(Date.now() - 9 * 60 * 60_000),
      recordedAt: new Date(),
      githubEventId: null,
    },
    {
      repoFullName: 'alice/awesome-project',
      eventType: 'pr_abandoned',
      actor: '@eve',
      subject: 'closed #34 without merging',
      linkUrl: 'https://github.com/alice/awesome-project/pull/34',
      occurredAt: new Date(Date.now() - 8 * 60 * 60_000),
      recordedAt: new Date(),
      githubEventId: 'evt_005',
    },
    {
      repoFullName: 'alice/awesome-project',
      eventType: 'pr_merged',
      actor: '@frank',
      subject: 'merged #33 — Fix critical auth bypass vulnerability in session handling',
      linkUrl: 'https://github.com/alice/awesome-project/pull/33',
      occurredAt: new Date(Date.now() - 10 * 60 * 60_000),
      recordedAt: new Date(),
      githubEventId: 'evt_006',
    },
  ]
  repos.activity.upsertActivities('alice/awesome-project', activities)

  // Seed fresh activity_meta so server never calls GitHub Events API during E2E
  repos.activity.upsertMeta('alice/awesome-project', {
    eventsEtag: '"seed-etag-1"',
    eventsCachedAt: new Date(),
    pollIntervalSecs: 60,
    dependabotCachedAt: new Date(),
  })
  repos.activity.upsertMeta('alice/another-repo', {
    eventsEtag: '"seed-etag-2"',
    eventsCachedAt: new Date(),
    pollIntervalSecs: 60,
    dependabotCachedAt: new Date(),
  })

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
