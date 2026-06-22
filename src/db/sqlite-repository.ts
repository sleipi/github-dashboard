import { Database } from 'bun:sqlite'
import { createSqliteActivityRepo } from './activity/sqlite-activity-repo.ts'
import { createSqliteAuthRepo } from './auth/sqlite-auth-repo.ts'
import { createSqliteCardRepo } from './cards/sqlite-card-repo.ts'
import { createSqliteDependabotRepo } from './dependabot/sqlite-dependabot-repo.ts'
import { runMigrations } from './migrations.ts'
import { createSqlitePrRepo } from './pull-requests/sqlite-pr-repo.ts'
import type { Repos } from './repos.ts'

export function createSqliteRepos(dbPath: string): Repos {
  const db = new Database(dbPath, { create: true })
  db.run('PRAGMA journal_mode = WAL')
  runMigrations(db)
  return {
    auth: createSqliteAuthRepo(db),
    cards: createSqliteCardRepo(db),
    pullRequests: createSqlitePrRepo(db),
    dependabot: createSqliteDependabotRepo(db),
    activity: createSqliteActivityRepo(db),
    close() {
      db.close()
    },
  }
}
