export type PrRowViewModel = {
  readonly number: number
  readonly title: string
  readonly draft: boolean
  readonly ciColor: string
  readonly ciLabel: string
  readonly prUrl: string
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
  readonly depDisplay: string // "5" oder "—"
  readonly depColor: string
  readonly depLabel: string
  readonly depTrend: string // "(+2, -1)" oder ""
  readonly hasDepTrend: boolean
  readonly depCollecting: boolean
  readonly prs: ReadonlyArray<PrRowViewModel>
  readonly hasPrs: boolean
  readonly noPrs: boolean
  readonly prTotal: number
  readonly prMore: number
  readonly hasMore: boolean
  readonly prMoreLabel: string
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
