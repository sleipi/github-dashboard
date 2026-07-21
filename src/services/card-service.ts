// src/services/card-service.ts
import type { Repos } from '../db/repos.ts'
import type {
  PullRequest,
  RefreshHint,
  RepoCache,
  SecurityAlert,
  SecurityCounts,
} from '../db/types.ts'
import type { GitHubClient, GitHubRepo } from '../github/github-client.ts'
import { calculateSecurityCounts } from './security-service.ts'

const MAX_CI_CHECKS = 3

export type CardData = {
  readonly fullName: string
  readonly cache: RepoCache
  readonly prs: ReadonlyArray<PullRequest>
  readonly securityCounts: SecurityCounts
  readonly mostRecentActivityAt: Date | null
}

export type CardService = {
  getCard(fullName: string, refreshNeeded: ReadonlySet<RefreshHint>): Promise<CardData>
  getPinned(): string[]
  getAllRepos(): Promise<GitHubRepo[]>
  togglePin(fullName: string): boolean
  reorder(fullNames: string[]): void
  isAutoSortEnabled(): boolean
  setAutoSort(enabled: boolean): void
}

export function computeMostRecentActivity(
  lastCommitAt: Date | null,
  prs: ReadonlyArray<PullRequest>,
  alerts: ReadonlyArray<SecurityAlert>,
): Date | null {
  const timestamps: number[] = []
  if (lastCommitAt) timestamps.push(lastCommitAt.getTime())
  for (const pr of prs) timestamps.push(pr.updatedAt.getTime())
  for (const alert of alerts) timestamps.push(alert.createdAt.getTime())
  return timestamps.length === 0 ? null : new Date(Math.max(...timestamps))
}

export function createCardService(repos: Repos, client: GitHubClient): CardService {
  async function fetchSelective(
    fullName: string,
    refreshNeeded: ReadonlySet<RefreshHint>,
  ): Promise<void> {
    const now = new Date()
    const existing = repos.pullRequests.getCache(fullName)

    let githubPrs: Awaited<ReturnType<typeof client.getPrs>> | null = null
    let lastCommitAt: Date | null | undefined = undefined
    try {
      ;[githubPrs, lastCommitAt] = await Promise.all([
        refreshNeeded.has('prs') ? client.getPrs(fullName) : Promise.resolve(null),
        refreshNeeded.has('commits')
          ? client.getLastCommitDate(fullName)
          : Promise.resolve(undefined),
      ])
    } catch (err) {
      if (!existing) throw err
      return
    }

    if (githubPrs !== null && refreshNeeded.has('prs')) {
      const prsWithCi: PullRequest[] = await Promise.all(
        githubPrs.slice(0, MAX_CI_CHECKS).map(async (pr) => ({
          repoFullName: fullName,
          number: pr.number,
          title: pr.title,
          draft: pr.draft,
          ciStatus: await client.getCiStatus(fullName, pr.headSha),
          prUrl: pr.htmlUrl,
          creator: pr.creator,
          labels: pr.labels,
          createdAt: new Date(pr.createdAt),
          updatedAt: new Date(pr.updatedAt),
        })),
      )
      const prsRest: PullRequest[] = githubPrs.slice(MAX_CI_CHECKS).map((pr) => ({
        repoFullName: fullName,
        number: pr.number,
        title: pr.title,
        draft: pr.draft,
        ciStatus: 'unknown' as const,
        prUrl: pr.htmlUrl,
        creator: pr.creator,
        labels: pr.labels,
        createdAt: new Date(pr.createdAt),
        updatedAt: new Date(pr.updatedAt),
      }))
      repos.pullRequests.upsertPrs(fullName, [...prsWithCi, ...prsRest])
      repos.activity.upsertMeta(fullName, { prsCachedAt: now })
    }

    const depCount = repos.activity.getDependabotCount(fullName)
    const commitAt = lastCommitAt !== undefined ? lastCommitAt : (existing?.lastCommitAt ?? null)
    const prTotal = githubPrs !== null ? githubPrs.length : (existing?.prTotal ?? 0)

    repos.pullRequests.upsertCache(fullName, {
      lastCommitAt: commitAt,
      prTotal,
      dependabotCount: depCount,
    })
  }

  async function getCard(
    fullName: string,
    refreshNeeded: ReadonlySet<RefreshHint>,
  ): Promise<CardData> {
    const cached = repos.pullRequests.getCache(fullName)
    const needsFetch = !cached || refreshNeeded.size > 0

    if (needsFetch) await fetchSelective(fullName, refreshNeeded)

    const cache = repos.pullRequests.getCache(fullName)
    if (!cache) throw new Error(`Cache missing for ${fullName} after fetch`)

    const depCount = repos.activity.getDependabotCount(fullName)
    const cacheWithDep: RepoCache = { ...cache, dependabotCount: depCount }

    const prs = repos.pullRequests.getPrs(fullName)
    const alerts = repos.security.getAlerts(fullName)
    const sla = repos.sla.getSla()
    const securityCounts = calculateSecurityCounts(alerts, sla, new Date())
    const mostRecentActivityAt = computeMostRecentActivity(cacheWithDep.lastCommitAt, prs, alerts)

    return { fullName, cache: cacheWithDep, prs, securityCounts, mostRecentActivityAt }
  }

  return {
    getCard,

    getPinned() {
      return repos.cards.getPinned().map((p) => p.fullName)
    },

    async getAllRepos() {
      return client.getRepos()
    },

    togglePin(fullName) {
      if (repos.cards.isPinned(fullName)) {
        repos.cards.unpin(fullName)
        return false
      }
      repos.cards.pin(fullName)
      return true
    },

    reorder(fullNames) {
      repos.cards.reorder(fullNames)
    },

    isAutoSortEnabled() {
      return repos.autoSort.isEnabled()
    },

    setAutoSort(enabled) {
      repos.autoSort.setEnabled(enabled)
    },
  }
}
