import type { Database } from 'bun:sqlite'
import type { AuthRepo } from './auth-repo.ts'

export function createSqliteAuthRepo(_db: Database): AuthRepo {
  return {} as AuthRepo
}
