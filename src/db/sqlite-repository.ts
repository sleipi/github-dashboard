import { Database } from 'bun:sqlite'
import { createSqliteActivityRepo } from './activity/sqlite-activity-repo.ts'
import { createSqliteAuthRepo } from './auth/sqlite-auth-repo.ts'
import { createSqliteCardRepo } from './cards/sqlite-card-repo.ts'
import { runMigrations } from './migrations.ts'
import { createSqlitePrRepo } from './pull-requests/sqlite-pr-repo.ts'
import type { Repos } from './repos.ts'
import { createSqliteSecurityAlertsRepo } from './security/sqlite-security-alerts-repo.ts'
import { createSqliteAutoSortRepo } from './settings/sqlite-auto-sort-repo.ts'
import { createSqliteGlobalSearchRepo } from './settings/sqlite-global-search-repo.ts'
import { createSqliteSlaRepo } from './sla/sqlite-sla-repo.ts'

export function createSqliteRepos(dbPath: string): Repos {
  const db = new Database(dbPath, { create: true })
  db.run('PRAGMA journal_mode = WAL')
  runMigrations(db)
  return {
    auth: createSqliteAuthRepo(db),
    cards: createSqliteCardRepo(db),
    pullRequests: createSqlitePrRepo(db),
    activity: createSqliteActivityRepo(db),
    security: createSqliteSecurityAlertsRepo(db),
    sla: createSqliteSlaRepo(db),
    autoSort: createSqliteAutoSortRepo(db),
    globalSearch: createSqliteGlobalSearchRepo(db),
    close() {
      db.close()
    },
  }
}
