import type { ActivityRepo } from './activity/activity-repo.ts'
import type { AuthRepo } from './auth/auth-repo.ts'
import type { CardRepo } from './cards/card-repo.ts'
import type { DependabotRepo } from './dependabot/dependabot-repo.ts'
import type { PrRepo } from './pull-requests/pr-repo.ts'

export interface Repos {
  readonly auth: AuthRepo
  readonly cards: CardRepo
  readonly pullRequests: PrRepo
  readonly dependabot: DependabotRepo
  readonly activity: ActivityRepo
  close(): void
}
