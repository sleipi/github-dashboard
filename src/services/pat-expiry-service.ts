export type PatExpirySeverity = 'info' | 'notice' | 'warning'

export function getPatExpirySeverity(expiresAt: Date, now: Date): PatExpirySeverity {
  const days = (expiresAt.getTime() - now.getTime()) / 86_400_000
  if (days <= 3) return 'warning'
  if (days <= 21) return 'notice'
  return 'info'
}
