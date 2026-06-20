import type { AuthToken } from '../types.ts'

export interface AuthRepo {
  getToken(): AuthToken | null
  saveToken(token: AuthToken): void
  deleteToken(): void
}
