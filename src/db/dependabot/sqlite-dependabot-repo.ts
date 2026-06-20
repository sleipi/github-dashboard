import type { Database } from 'bun:sqlite'
import type { DependabotRepo } from './dependabot-repo.ts'

export function createSqliteDependabotRepo(_db: Database): DependabotRepo {
  return {} as DependabotRepo
}
