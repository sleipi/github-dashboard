// src/services/card-service.ts
import type { Repos } from '../db/repos.ts'
import type { DependabotTrend, PullRequest, RefreshHint, RepoCache } from '../db/types.ts'
import type { GitHubClient, GitHubRepo } from '../github/github-client.ts'
import { calculateTrend } from './dependabot-service.ts'

const MAX_CI_CHECKS = 3
const DEP_INTERVAL_MS = 30 * 60 * 1000
const DEP_PRUNE_DAYS = 183

export type CardData = {
  readonly fullName: string
  readonly cache: RepoCache
  readonly prs: ReadonlyArray<PullRequest>
  readonly trend: DependabotTrend
}

export type CardService = {
  getCard(fullName: string, refreshNeeded: ReadonlySet<RefreshHint>): Promise<CardData>
  getPinned(): string[]
  getAllRepos(): Promise<GitHubRepo[]>
  togglePin(fullName: string): boolean
  reorder(fullNames: string[]): void
}

export function createCardService(repos: Repos, client: GitHubClient): CardService {
  async function fetchSelective(
    fullName: string,
    refreshNeeded: ReadonlySet<RefreshHint>,
  ): Promise<void> {
    const now = new Date()
    const existing = repos.pullRequests.getCache(fullName)

    const [githubPrs, lastCommitAt] = await Promise.all([
      refreshNeeded.has('prs') ? client.getPrs(fullName) : Promise.resolve(null),
      refreshNeeded.has('commits')
        ? client.getLastCommitDate(fullName)
        : Promise.resolve(undefined),
    ])

    if (githubPrs !== null && refreshNeeded.has('prs')) {
      // Fetched new PRs — also refresh CI for top MAX_CI_CHECKS
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
    } else if (refreshNeeded.has('ci') && !refreshNeeded.has('prs')) {
      // CI-only skip: no fresh PR SHAs available, leave stored CI status as-is
    }

    const depCount = repos.activity.getDependabotCount(fullName)
    const commitAt = lastCommitAt !== undefined ? lastCommitAt : (existing?.lastCommitAt ?? null)
    const prTotal = githubPrs !== null ? githubPrs.length : (existing?.prTotal ?? 0)

    repos.pullRequests.upsertCache(fullName, {
      lastCommitAt: commitAt,
      prTotal,
      dependabotCount: depCount,
    })

    repos.dependabot.maybeRecordSnapshot(fullName, depCount, now, DEP_INTERVAL_MS)
    repos.dependabot.pruneOld(DEP_PRUNE_DAYS, now)
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

    // Always reflect current activity count in the returned cache
    const depCount = repos.activity.getDependabotCount(fullName)
    const cacheWithDep: RepoCache = { ...cache, dependabotCount: depCount }

    const prs = repos.pullRequests.getPrs(fullName)
    const history = repos.dependabot.getHistory(fullName)
    const trend = calculateTrend(history, new Date())

    return { fullName, cache: cacheWithDep, prs, trend }
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
  }
}
