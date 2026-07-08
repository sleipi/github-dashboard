import type { Database } from 'bun:sqlite'
import type { SecurityAlert } from '../types.ts'
import type { SecurityAlertsRepo } from './security-alerts-repo.ts'

type AlertRow = {
  repo_full_name: string
  number: number
  ecosystem: string
  package_name: string
  title: string
  severity: string
  cvss_score: number | null
  created_at: string
  html_url: string
}

export function createSqliteSecurityAlertsRepo(db: Database): SecurityAlertsRepo {
  const insert = db.prepare(`
    INSERT INTO security_alerts
      (repo_full_name, number, ecosystem, package_name, title, severity, cvss_score, created_at, html_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  return {
    upsertAlerts(fullName, alerts) {
      db.transaction(() => {
        db.run('DELETE FROM security_alerts WHERE repo_full_name = ?', [fullName])
        for (const a of alerts) {
          insert.run(
            fullName,
            a.number,
            a.ecosystem,
            a.packageName,
            a.title,
            a.severity,
            a.cvssScore,
            a.createdAt.toISOString(),
            a.htmlUrl,
          )
        }
      })()
    },

    getAlerts(fullName) {
      return db
        .query<AlertRow, [string]>(
          `SELECT repo_full_name, number, ecosystem, package_name, title, severity, cvss_score, created_at, html_url
           FROM security_alerts
           WHERE repo_full_name = ?
           ORDER BY
             CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
             created_at ASC`,
        )
        .all(fullName)
        .map((row) => ({
          repoFullName: row.repo_full_name,
          number: row.number,
          ecosystem: row.ecosystem,
          packageName: row.package_name,
          title: row.title,
          severity: row.severity as SecurityAlert['severity'],
          cvssScore: row.cvss_score,
          createdAt: new Date(row.created_at),
          htmlUrl: row.html_url,
        }))
    },
  }
}
