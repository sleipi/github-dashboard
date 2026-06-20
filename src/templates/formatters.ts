import type { CiStatus, DependabotTrend } from '../db/types.ts'

export function formatRelative(date: Date | null, now: Date = new Date()): string {
  if (!date) return '—'
  const s = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (s < 60) return 'Gerade eben'
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`
  const days = Math.floor(s / 86400)
  if (days < 30) return `vor ${days} Tag${days === 1 ? '' : 'en'}`
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })
}

const CI_COLOR: Record<CiStatus, string> = {
  success: '#3fb950',
  failure: '#f85149',
  pending: '#d29922',
  unknown: '#8b949e',
}

const CI_LABEL: Record<CiStatus, string> = {
  success: 'CI: erfolgreich',
  failure: 'CI: fehlgeschlagen',
  pending: 'CI: läuft…',
  unknown: 'Kein CI',
}

export function ciColor(status: CiStatus): string {
  return CI_COLOR[status]
}

export function ciLabel(status: CiStatus): string {
  return CI_LABEL[status]
}

export function aggregateCiStatus(statuses: CiStatus[]): CiStatus | null {
  if (statuses.length === 0) return null
  if (statuses.some((s) => s === 'failure')) return 'failure'
  if (statuses.some((s) => s === 'pending')) return 'pending'
  if (statuses.every((s) => s === 'success')) return 'success'
  return 'unknown'
}

export function depColor(count: number | null): string {
  if (count === null) return '#6e7681'
  if (count === 0) return '#3fb950'
  if (count > 5) return '#f85149'
  return '#d29922'
}

export function formatTrend(trend: DependabotTrend): string {
  const parts: string[] = []
  if (trend.week !== null) parts.push((trend.week > 0 ? '+' : '') + trend.week)
  if (trend.month !== null) parts.push((trend.month > 0 ? '+' : '') + trend.month)
  if (trend.sixMonths !== null) parts.push((trend.sixMonths > 0 ? '+' : '') + trend.sixMonths)
  return parts.length ? `(${parts.join(', ')})` : ''
}
