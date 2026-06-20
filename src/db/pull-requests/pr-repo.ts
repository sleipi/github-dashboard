import type { PullRequest, RepoCache, RepoCacheUpdate } from '../types.ts'

export interface PrRepo {
  getCache(fullName: string): RepoCache | null
  upsertCache(fullName: string, data: RepoCacheUpdate): void
  getPrs(fullName: string): PullRequest[]
  upsertPrs(fullName: string, prs: ReadonlyArray<PullRequest>): void
}
