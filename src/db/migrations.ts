import type { Database } from 'bun:sqlite'

type Migration = (db: Database) => void

const MIGRATIONS: Migration[] = [
  // v1: initial schema
  (db) => {
    db.run(`CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`)
    db.run(`CREATE TABLE pinned_repos (
      full_name  TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      pinned_at  TEXT NOT NULL
    )`)
    db.run(`CREATE TABLE repo_cache (
      full_name         TEXT PRIMARY KEY,
      last_commit_at    TEXT,
      pr_total          INTEGER NOT NULL DEFAULT 0,
      dependabot_count  INTEGER,
      cached_at         TEXT NOT NULL
    )`)
    db.run(`CREATE TABLE pull_requests (
      repo_full_name  TEXT NOT NULL,
      number          INTEGER NOT NULL,
      title           TEXT NOT NULL,
      draft           INTEGER NOT NULL DEFAULT 0,
      ci_status       TEXT NOT NULL DEFAULT 'unknown',
      pr_url          TEXT NOT NULL,
      creator         TEXT NOT NULL,
      labels          TEXT NOT NULL DEFAULT '[]',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      PRIMARY KEY (repo_full_name, number)
    )`)
    db.run(`CREATE TABLE dependabot_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_full_name  TEXT NOT NULL,
      count           INTEGER NOT NULL,
      recorded_at     TEXT NOT NULL
    )`)
  },
  // v2: activity tables
  (db) => {
    db.run(`CREATE TABLE activity (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_full_name   TEXT NOT NULL,
      event_type       TEXT NOT NULL,
      actor            TEXT NOT NULL,
      subject          TEXT NOT NULL,
      link_url         TEXT NOT NULL,
      occurred_at      TEXT NOT NULL,
      recorded_at      TEXT NOT NULL,
      github_event_id  TEXT,
      UNIQUE (repo_full_name, github_event_id)
    )`)
    db.run(`CREATE TABLE activity_meta (
      repo_full_name       TEXT PRIMARY KEY,
      events_etag          TEXT,
      events_cached_at     TEXT,
      poll_interval_secs   INTEGER NOT NULL DEFAULT 60,
      dependabot_cached_at TEXT
    )`)
  },
]

export function runMigrations(db: Database): void {
  const row = db.query<{ user_version: number }, []>('PRAGMA user_version').get()
  const version = row?.user_version ?? 0
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      MIGRATIONS[i]?.(db)
      db.run(`PRAGMA user_version = ${i + 1}`)
    })()
  }
}
