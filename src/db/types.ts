export type CiStatus = 'success' | 'failure' | 'pending' | 'unknown'

export type Label = {
  readonly name: string
  readonly color: string // hex ohne '#', z.B. '3fb950'
}

export type AuthToken = {
  readonly pat: string
  readonly username: string
  readonly avatarUrl: string
  readonly expiresAt: Date | null
}

export type PinnedRepo = {
  readonly fullName: string
  readonly sortOrder: number
  readonly pinnedAt: Date
}

export type RepoCache = {
  readonly fullName: string
  readonly lastCommitAt: Date | null
  readonly prTotal: number
  readonly dependabotCount: number | null // null = kein security_events Scope
  readonly cachedAt: Date
}

export type RepoCacheUpdate = {
  readonly lastCommitAt: Date | null
  readonly prTotal: number
  readonly dependabotCount: number | null
}

export type PullRequest = {
  readonly repoFullName: string
  readonly number: number
  readonly title: string
  readonly draft: boolean
  readonly ciStatus: CiStatus
  readonly prUrl: string
  readonly creator: string
  readonly labels: ReadonlyArray<Label>
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type DependabotSnapshot = {
  readonly repoFullName: string
  readonly count: number
  readonly recordedAt: Date
}

export type DependabotTrend = {
  readonly week: number | null
  readonly month: number | null
  readonly sixMonths: number | null
}
