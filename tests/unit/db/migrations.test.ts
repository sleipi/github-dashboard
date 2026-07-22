import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { runMigrations } from '../../../src/db/migrations.ts'
import { cleanupTempDir, createTempDbPath } from '../helpers/temp-db.ts'

describe('runMigrations', () => {
  const cleanup: string[] = []
  afterEach(() => {
    cleanup.splice(0).forEach(cleanupTempDir)
  })

  test('creates all tables on fresh database', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-migrations-')
    cleanup.push(dir)
    const db = new Database(dbPath)

    runMigrations(db)

    const tables = db
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )
      .all()
      .map((r) => r.name)

    expect(tables).toContain('settings')
    expect(tables).toContain('pinned_repos')
    expect(tables).toContain('repo_cache')
    expect(tables).toContain('pull_requests')
    expect(tables).toContain('dependabot_history')
    expect(tables).toContain('activity')
    expect(tables).toContain('activity_meta')
    expect(tables).toContain('security_alerts')

    db.close()
  })

  test('sets user_version after migration', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-migrations-')
    cleanup.push(dir)
    const db = new Database(dbPath)

    runMigrations(db)

    const row = db.query<{ user_version: number }, []>('PRAGMA user_version').get()
    expect(row?.user_version).toBe(5)
    db.close()
  })

  test('is idempotent — running twice does not throw', () => {
    const { dir, dbPath } = createTempDbPath('gh-dash-migrations-')
    cleanup.push(dir)
    const db = new Database(dbPath)

    runMigrations(db)
    expect(() => runMigrations(db)).not.toThrow()
    db.close()
  })
})
