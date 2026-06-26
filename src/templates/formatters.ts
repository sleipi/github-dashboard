import type { CiStatus, DependabotTrend } from '../db/types.ts'

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatRelative(date: Date | null, now: Date = new Date()): string {
  if (!date) return '—'
  const s = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  const days = Math.floor(s / 86400)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const CI_COLOR: Record<CiStatus, string> = {
  success: '#3fb950',
  failure: '#f85149',
  pending: '#d29922',
  unknown: '#8b949e',
}

const CI_LABEL: Record<CiStatus, string> = {
  success: 'CI passing',
  failure: 'CI failing',
  pending: 'CI running…',
  unknown: 'No CI status',
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

export function depColor(count: number): string {
  if (count === 0) return '#3fb950'
  if (count > 5) return '#f85149'
  return '#d29922'
}

export function ageRowStyle(date: Date | null, now: Date = new Date()): string {
  if (!date) return ''
  const days = (now.getTime() - date.getTime()) / 86_400_000
  if (days > 90) return 'background:rgba(248,113,113,0.22)'
  if (days > 30) return 'background:rgba(248,113,113,0.16)'
  if (days > 14) return 'background:rgba(248,113,113,0.11)'
  if (days > 7) return 'background:rgba(248,113,113,0.07)'
  return ''
}

export function depBgColor(count: number): string {
  if (count === 0) return 'rgba(63,185,80,0.12)'
  if (count > 5) return 'rgba(248,81,73,0.15)'
  return 'rgba(210,153,34,0.15)'
}

export function formatDepLabel(count: number, trend: DependabotTrend): string {
  const base =
    count === 0
      ? 'No Dependabot alerts'
      : count >= 100
        ? '99+ open Dependabot alerts'
        : `${count} open Dependabot alert${count === 1 ? '' : 's'}`

  if (trend.week === null && trend.month === null && trend.sixMonths === null) return base

  const fmt = (n: number) => (n > 0 ? `+${n}` : String(n))
  const w = trend.week
  const m = trend.month ?? trend.week
  const h = trend.sixMonths ?? trend.month ?? trend.week
  const ww = w !== null ? fmt(w) : '?'
  const mm = m !== null ? fmt(m) : '?'
  const hh = h !== null ? fmt(h) : '?'
  return `${base}\n${ww} this week · ${mm} this month · ${hh} last 6 months`
}
