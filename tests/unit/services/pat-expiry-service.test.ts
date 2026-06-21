import { describe, expect, test } from 'bun:test'
import { getPatExpirySeverity } from '../../../src/services/pat-expiry-service.ts'

const DAY = 86_400_000

describe('getPatExpirySeverity', () => {
  test('returns warning when token expires in 3 days', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 3 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('warning')
  })

  test('returns warning when token expires in 1 day', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 1 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('warning')
  })

  test('returns warning when token has already expired', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() - 1 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('warning')
  })

  test('returns notice when token expires in 4 days (boundary)', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 4 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('notice')
  })

  test('returns notice when token expires in 14 days', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 14 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('notice')
  })

  test('returns notice when token expires in 21 days (boundary)', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 21 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('notice')
  })

  test('returns info when token expires in 22 days', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 22 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('info')
  })

  test('returns info when token expires in 90 days', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const expiresAt = new Date(now.getTime() + 90 * DAY)
    expect(getPatExpirySeverity(expiresAt, now)).toBe('info')
  })
})
