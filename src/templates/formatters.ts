import type { CiStatus } from '../db/types.ts'

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

export function ageRowStyle(date: Date | null, now: Date = new Date()): string {
  if (!date) return ''
  const days = (now.getTime() - date.getTime()) / 86_400_000
  if (days > 90) return 'background:rgba(248,113,113,0.22)'
  if (days > 30) return 'background:rgba(248,113,113,0.16)'
  if (days > 14) return 'background:rgba(248,113,113,0.11)'
  if (days > 7) return 'background:rgba(248,113,113,0.07)'
  return ''
}

const FRESH_OPACITIES = [0.5, 0.42, 0.33, 0.25, 0.17, 0.08] as const

/**
 * Returns a green highlight for items < 6 hours old, then falls back to ageRowStyle (red scale).
 * Mirrors the PR freshness colouring logic.
 */
export function freshAgeStyle(date: Date | null, now: Date = new Date()): string {
  if (!date) return ''
  const ageHours = Math.floor((now.getTime() - date.getTime()) / 3_600_000)
  if (ageHours < 6) return `background:rgba(34,197,94,${FRESH_OPACITIES[ageHours]})`
  return ageRowStyle(date, now)
}
