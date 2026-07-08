import type { Database } from 'bun:sqlite'
import type { SlaSettings } from '../types.ts'
import type { SlaRepo } from './sla-repo.ts'

const DEFAULTS: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }

export function createSqliteSlaRepo(db: Database): SlaRepo {
  const get = db.query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')

  function getInt(key: string, fallback: number): number {
    const raw = get.get(key)?.value
    const parsed = raw !== undefined ? Number.parseInt(raw, 10) : Number.NaN
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return {
    getSla() {
      return {
        critical: getInt('sla_critical_days', DEFAULTS.critical),
        high: getInt('sla_high_days', DEFAULTS.high),
        medium: getInt('sla_medium_days', DEFAULTS.medium),
        low: getInt('sla_low_days', DEFAULTS.low),
      }
    },

    setSla(settings) {
      db.transaction(() => {
        upsert.run('sla_critical_days', String(settings.critical))
        upsert.run('sla_high_days', String(settings.high))
        upsert.run('sla_medium_days', String(settings.medium))
        upsert.run('sla_low_days', String(settings.low))
      })()
    },
  }
}
