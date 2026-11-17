import { describe, expect, test } from 'bun:test'
import {
  createRateLimitRoutes,
  toRateLimitViewModel,
} from '../../../src/routes/rate-limit-route.ts'

const resetAt = new Date('2026-11-17T16:39:30Z')

describe('toRateLimitViewModel', () => {
  test('shows a dash when no GitHub response has been seen yet', () => {
    const vm = toRateLimitViewModel(null)
    expect(vm.label).toBe('API –')
  })

  test('formats remaining/limit', () => {
    const vm = toRateLimitViewModel({ limit: 5000, remaining: 4231, resetAt })
    expect(vm.label).toContain('4,231/5,000')
  })

  test('is green above 50%, amber between 20% and 50%, red below 20%', () => {
    const color = (remaining: number) =>
      toRateLimitViewModel({ limit: 5000, remaining, resetAt }).color
    expect(color(4000)).toBe('#3fb950')
    expect(color(2000)).toBe('#d29922')
    expect(color(500)).toBe('#f85149')
    expect(color(0)).toBe('#f85149')
  })

  test('puts the reset time into the tooltip', () => {
    const vm = toRateLimitViewModel({ limit: 5000, remaining: 10, resetAt })
    expect(vm.title).toContain('Resets')
  })
})

describe('rate limit route', () => {
  test('GET /api/rate-limit returns an HTML fragment without calling GitHub', async () => {
    const client = {
      getRateLimit: () => ({ limit: 5000, remaining: 123, resetAt }),
    }
    const routes = createRateLimitRoutes(client)
    const url = new URL('http://localhost:4242/api/rate-limit')
    const route = routes.find((r) => r.match(url, 'GET'))
    if (!route) throw new Error('route not found')

    const res = await route.handle(new Request(url.href), url)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(body).toContain('id="rate-limit"')
    expect(body).toContain('123/5,000')
    expect(body).toContain('hx-get="/api/rate-limit"')
  })
})
