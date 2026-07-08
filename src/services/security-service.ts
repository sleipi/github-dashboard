import type { SecurityAlert, SecurityCounts, SlaSettings } from '../db/types.ts'

export function calculateSecurityCounts(
  alerts: readonly SecurityAlert[],
  sla: SlaSettings,
  now: Date,
): SecurityCounts {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  const overdueSeverities = new Set<'critical' | 'high' | 'medium' | 'low'>()

  for (const alert of alerts) {
    counts[alert.severity]++
    const ageDays = (now.getTime() - alert.createdAt.getTime()) / 86_400_000
    if (ageDays > sla[alert.severity]) {
      overdueSeverities.add(alert.severity)
    }
  }

  return { ...counts, overdueSeverities }
}
