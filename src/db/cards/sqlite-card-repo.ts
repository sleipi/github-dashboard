import type { Database } from 'bun:sqlite'
import type { CardRepo } from './card-repo.ts'

export function createSqliteCardRepo(_db: Database): CardRepo {
  return {} as CardRepo
}
