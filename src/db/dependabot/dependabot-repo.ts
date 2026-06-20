import type { DependabotSnapshot } from '../types.ts'

export interface DependabotRepo {
  // Speichert Snapshot nur wenn letzter > minIntervalMs ago oder kein Snapshot existiert
  maybeRecordSnapshot(fullName: string, count: number, now: Date, minIntervalMs: number): void
  getHistory(fullName: string): DependabotSnapshot[]
  pruneOld(daysToKeep: number, now: Date): void
}
