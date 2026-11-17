// src/routes/rate-limit-route.ts
import type { RateLimitStatus } from '../github/github-client.ts'
import { type RateLimitViewModel, renderRateLimit } from '../templates/rate-limit-template.ts'
import type { RouteHandler } from './route-handler.ts'
import { html } from './route-handler.ts'

const GREEN = '#3fb950'
const AMBER = '#d29922'
const RED = '#f85149'
const GREY = '#6e7681'

export function toRateLimitViewModel(status: RateLimitStatus | null): RateLimitViewModel {
  if (!status) {
    return { label: 'API –', title: 'No GitHub response seen yet', color: GREY }
  }
  const share = status.limit > 0 ? status.remaining / status.limit : 0
  const color = share > 0.5 ? GREEN : share > 0.2 ? AMBER : RED
  const resetTime = status.resetAt.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return {
    label: `API ${status.remaining.toLocaleString('en-US')}/${status.limit.toLocaleString('en-US')} · reset ${resetTime}`,
    title: `GitHub API requests left. Resets at ${resetTime}`,
    color,
  }
}

export function createRateLimitRoutes(client: {
  getRateLimit(): RateLimitStatus | null
}): RouteHandler[] {
  return [
    {
      match: (url, method) => url.pathname === '/api/rate-limit' && method === 'GET',
      handle() {
        return html(renderRateLimit(toRateLimitViewModel(client.getRateLimit())))
      },
    },
  ]
}
