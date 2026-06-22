import type { Activity, ActivityMeta } from '../types.ts'

export interface ActivityRepo {
  getActivities(fullName: string): Activity[]
  upsertActivities(fullName: string, activities: ReadonlyArray<Omit<Activity, 'id'>>): void
  getDependabotCount(fullName: string): number
  getMeta(fullName: string): ActivityMeta | null
  upsertMeta(fullName: string, meta: Partial<Omit<ActivityMeta, 'repoFullName'>>): void
}
