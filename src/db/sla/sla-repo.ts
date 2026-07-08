import type { SlaSettings } from '../types.ts'

export interface SlaRepo {
  getSla(): SlaSettings
  setSla(settings: SlaSettings): void
}
