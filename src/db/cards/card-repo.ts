import type { PinnedRepo } from '../types.ts'

export interface CardRepo {
  getPinned(): PinnedRepo[]
  isPinned(fullName: string): boolean
  pin(fullName: string): void
  unpin(fullName: string): void
  reorder(fullNames: string[]): void // sets sort_order by array position
  getColor(fullName: string): string | null
  setColor(fullName: string, color: string | null): void
}
