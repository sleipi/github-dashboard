export type ActivityItemViewModel = {
  readonly text: string
  readonly linkUrl: string
  readonly timeAgo: string
}

export type PrRowViewModel = {
  readonly number: number
  readonly title: string
  readonly draft: boolean
  readonly ciColor: string
  readonly ciLabel: string
  readonly prUrl: string
  readonly newHighlightHours: number | null // null = no highlight; 0–5 = hour band
}

export type CardViewModel = {
  readonly fullName: string
  readonly owner: string
  readonly name: string
  readonly repoUrl: string
  readonly securityUrl: string
  readonly lastCommit: string // "vor 2 Std." oder "—"
  readonly ciDotColor: string
  readonly ciDotLabel: string
  readonly showCiDot: boolean
  readonly depDisplay: string // "0", "5", etc.
  readonly depColor: string
  readonly depLabel: string
  readonly depTrend: string // "(+2, -1)" oder ""
  readonly hasDepTrend: boolean
  readonly depCollecting: boolean
  readonly activities: readonly ActivityItemViewModel[]
  readonly activityMore: number
  readonly hasActivityMore: boolean
  readonly prs: ReadonlyArray<PrRowViewModel>
  readonly hasPrs: boolean
  readonly noPrs: boolean
  readonly prTotal: number
  readonly prMore: number
  readonly hasMore: boolean
  readonly prMoreLabel: string
  readonly borderColor: string
  readonly borderGlow: string
}

export type RepoListItemViewModel = {
  readonly fullName: string
  readonly name: string
  readonly owner: string
  readonly isPinned: boolean
  readonly isPrivate: boolean
  readonly language: string | null
  readonly starsDisplay: string | null
  readonly updatedAt: string
}
