// src/services/dependabot-service.ts
import type { DependabotSnapshot, DependabotTrend } from '../db/types.ts'

export function calculateTrend(history: DependabotSnapshot[], now: Date): DependabotTrend {
  if (history.length === 0) return { week: null, month: null, sixMonths: null }

  const latest = history[history.length - 1]
  if (!latest) return { week: null, month: null, sixMonths: null }
  const current = latest.count
  const nowMs = now.getTime()

  function findClosest(targetMs: number, minAgeMs: number): number | null {
    let best: DependabotSnapshot | null = null
    let bestDiff = Number.POSITIVE_INFINITY
    for (const snap of history) {
      const age = nowMs - snap.recordedAt.getTime()
      if (age < minAgeMs) continue
      const diff = Math.abs(snap.recordedAt.getTime() - targetMs)
      if (diff < bestDiff) {
        bestDiff = diff
        best = snap
      }
    }
    return best !== null ? current - best.count : null
  }

  const DAY = 86_400_000
  return {
    week: findClosest(nowMs - 7 * DAY, 3 * DAY),
    month: findClosest(nowMs - 30 * DAY, 14 * DAY),
    sixMonths: findClosest(nowMs - 183 * DAY, 60 * DAY),
  }
}
