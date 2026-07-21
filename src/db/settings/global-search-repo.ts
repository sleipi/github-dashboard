export interface GlobalSearchRepo {
  isEnabled(): boolean
  setEnabled(enabled: boolean): void
}
