import type { PinnedRepo } from '../types.ts'

export interface CardRepo {
  getPinned(): PinnedRepo[]
  isPinned(fullName: string): boolean
  pin(fullName: string): void
  unpin(fullName: string): void
  reorder(fullNames: string[]): void // setzt sort_order nach Array-Position
}
