export type ActivityItemViewModel = {
  readonly text: string
  readonly linkUrl: string
  readonly timeAgo: string
  readonly ageBgStyle: string
}

export type PrRowViewModel = {
  readonly number: number
  readonly title: string
  readonly draft: boolean
  readonly ciColor: string
  readonly ciLabel: string
  readonly prUrl: string
  readonly highlightStyle: string // "" or "background:rgba(34,197,94,0.42)"
}

export type CardViewModel = {
  readonly fullName: string
  readonly owner: string
  readonly name: string
  readonly repoUrl: string
  readonly lastCommit: string
  readonly ciDotColor: string
  readonly ciDotLabel: string
  readonly showCiDot: boolean
  readonly secCritical: number
  readonly secHigh: number
  readonly secMedium: number
  readonly secLow: number
  readonly secCriticalOverdue: boolean
  readonly secHighOverdue: boolean
  readonly secMediumOverdue: boolean
  readonly secLowOverdue: boolean
  readonly secScopeAvailable: boolean
  readonly secHasAlerts: boolean
  readonly activities: readonly ActivityItemViewModel[]
  readonly hasActivities: boolean
  readonly activityMore: number
  readonly hasActivityMore: boolean
  readonly prs: ReadonlyArray<PrRowViewModel>
  readonly hasPrs: boolean
  readonly noPrs: boolean
  readonly prTotal: number
  readonly prMore: number
  readonly hasMore: boolean
  readonly prMoreLabel: string
  readonly loadingId: string
  readonly borderStyle: string
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
  readonly checkboxChecked: '0' | '1'
  readonly checkboxBorderColor: string
  readonly checkboxBackground: string
  readonly checkboxSvg: string
  readonly languageDisplay: string
}

export type LabelViewModel = {
  readonly name: string
  readonly style: string // pre-computed from hex color
}

export type PrRowModalItem = {
  readonly prUrl: string
  readonly number: number
  readonly title: string
  readonly draft: boolean
  readonly ciColor: string
  readonly ciLabel: string
  readonly creator: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly labels: readonly LabelViewModel[]
  readonly ageBgStyle: string
}

export type PrModalViewModel = {
  readonly fullName: string
  readonly prs: readonly PrRowModalItem[]
}

export type ActivityModalItem = {
  readonly linkUrl: string
  readonly text: string
  readonly timeAgo: string
  readonly ageBgStyle: string
}

export type ActivityModalViewModel = {
  readonly fullName: string
  readonly hasActivities: boolean
  readonly activities: readonly ActivityModalItem[]
}

export type ExpiryBannerViewModel = {
  readonly color: string
  readonly buttonTitle: string
  readonly modalLabel: string
}

export type DashboardViewModel = {
  readonly cardsHtml: string
  readonly username: string
  readonly avatarUrl: string | null
  readonly expiry: ExpiryBannerViewModel | null
}
