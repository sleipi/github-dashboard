import type { Database } from 'bun:sqlite'
import type { PrRepo } from './pr-repo.ts'

export function createSqlitePrRepo(_db: Database): PrRepo {
  return {} as PrRepo
}
