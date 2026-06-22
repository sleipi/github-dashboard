// src/services/card-service.ts
import type { Repos } from '../db/repos.ts'
import type { DependabotTrend, PullRequest, RepoCache } from '../db/types.ts'
import type { GitHubClient, GitHubRepo } from '../github/github-client.ts'
import { calculateTrend } from './dependabot-service.ts'

const CACHE_TTL_MS = 30_000 // 30 Sekunden
const MAX_CI_CHECKS = 3 // CI nur für die ersten 3 PRs prüfen
const DEP_INTERVAL_MS = 30 * 60 * 1000 // Dependabot-Snapshot alle 30 Min
const DEP_PRUNE_DAYS = 183

export type CardData = {
  readonly fullName: string
  readonly cache: RepoCache
  readonly prs: ReadonlyArray<PullRequest>
  readonly trend: DependabotTrend
}

export type CardService = {
  getCard(fullName: string): Promise<CardData>
  getCards(): Promise<CardData[]>
  getAllRepos(): Promise<GitHubRepo[]>
  togglePin(fullName: string): boolean
  reorder(fullNames: string[]): void
}

export function createCardService(repos: Repos, client: GitHubClient): CardService {
  async function fetchAndCache(fullName: string): Promise<void> {
    const now = new Date()
    const [githubPrs, lastCommitAt] = await Promise.all([
      client.getPrs(fullName),
      client.getLastCommitDate(fullName),
    ])

    // CI für die ersten MAX_CI_CHECKS PRs
    const prsWithCi = await Promise.all(
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

    // Restliche PRs ohne CI-Check
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

    const depCount = repos.activity.getDependabotCount(fullName)

    repos.pullRequests.upsertPrs(fullName, [...prsWithCi, ...prsRest])
    repos.pullRequests.upsertCache(fullName, {
      lastCommitAt,
      prTotal: githubPrs.length,
      dependabotCount: depCount,
    })

    repos.dependabot.maybeRecordSnapshot(fullName, depCount, now, DEP_INTERVAL_MS)
    repos.dependabot.pruneOld(DEP_PRUNE_DAYS, now)
  }

  async function getCard(fullName: string): Promise<CardData> {
    const cached = repos.pullRequests.getCache(fullName)
    const isStale = !cached || Date.now() - cached.cachedAt.getTime() > CACHE_TTL_MS

    if (isStale) await fetchAndCache(fullName)

    const cache = repos.pullRequests.getCache(fullName)
    if (!cache) throw new Error(`Cache missing for ${fullName} after fetch`)
    const prs = repos.pullRequests.getPrs(fullName)
    const history = repos.dependabot.getHistory(fullName)
    const trend = calculateTrend(history, new Date())

    return { fullName, cache, prs, trend }
  }

  return {
    getCard,

    async getCards() {
      const pinned = repos.cards.getPinned()
      const results = await Promise.allSettled(pinned.map((p) => getCard(p.fullName)))
      return results
        .filter((r): r is PromiseFulfilledResult<CardData> => r.status === 'fulfilled')
        .map((r) => r.value)
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
