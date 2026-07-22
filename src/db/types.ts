export type CiStatus = 'success' | 'failure' | 'pending' | 'unknown'

export type Label = {
  readonly name: string
  readonly color: string // hex ohne '#', z.B. '3fb950'
}

export type AuthToken = {
  readonly pat: string
  readonly username: string
  readonly avatarUrl: string
  readonly expiresAt: Date | null | undefined // undefined = unchecked, null = confirmed no-expiry
}

export type PinnedRepo = {
  readonly fullName: string
  readonly sortOrder: number
  readonly pinnedAt: Date
  readonly color: string | null
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

export type SecurityAlert = {
  readonly repoFullName: string
  readonly number: number
  readonly ecosystem: string
  readonly packageName: string
  readonly title: string
  readonly severity: 'critical' | 'high' | 'medium' | 'low'
  readonly cvssScore: number | null
  readonly createdAt: Date
  readonly htmlUrl: string
}

export type SlaSettings = {
  readonly critical: number
  readonly high: number
  readonly medium: number
  readonly low: number
}

export type SecurityCounts = {
  readonly critical: number
  readonly high: number
  readonly medium: number
  readonly low: number
  readonly overdueSeverities: ReadonlySet<'critical' | 'high' | 'medium' | 'low'>
}

export type ActivityEventType =
  | 'pr_merged'
  | 'pr_abandoned'
  | 'pr_opened'
  | 'pr_review_approved'
  | 'pr_review_changes_requested'
  | 'release'
  | 'push'
  | 'security_alert'

export type Activity = {
  readonly id: number
  readonly repoFullName: string
  readonly eventType: ActivityEventType
  readonly actor: string
  readonly subject: string
  readonly linkUrl: string
  readonly occurredAt: Date
  readonly recordedAt: Date
  readonly githubEventId: string | null
}

export type ActivityMeta = {
  readonly repoFullName: string
  readonly eventsEtag: string | null
  readonly eventsCachedAt: Date | null
  readonly pollIntervalSecs: number
  readonly dependabotCachedAt: Date | null
  readonly prsCachedAt: Date | null
}

export type RefreshHint = 'prs' | 'commits' | 'ci'
