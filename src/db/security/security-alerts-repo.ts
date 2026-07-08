import type { SecurityAlert } from '../types.ts'

export interface SecurityAlertsRepo {
  upsertAlerts(fullName: string, alerts: readonly SecurityAlert[]): void
  getAlerts(fullName: string): SecurityAlert[]
}
