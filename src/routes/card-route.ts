import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { GitHubClient } from '../github/github-client.ts'
import type { CardData, CardService } from '../services/card-service.ts'
import { getPatExpirySeverity } from '../services/pat-expiry-service.ts'
import {
  renderCard,
  renderCardError,
  renderCards,
  toCardViewModel,
} from '../templates/card-template.ts'
import { renderDashboard } from '../templates/page-template.ts'
import { html, htmxTrigger, redirect } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

export function createCardRoutes(
  cardService: CardService,
  authRepo: AuthRepo,
  client: GitHubClient,
): RouteHandler[] {
  return [
    // GET / — full dashboard
    {
      match: (url, method) => url.pathname === '/' && method === 'GET',
      async handle() {
        let token = authRepo.getToken()
        if (!token) return redirect('/')

        // Backfill expiresAt once for existing users (fires at most once per token)
        if (token.expiresAt === undefined) {
          try {
            const user = await client.getUser()
            const updated = {
              ...token,
              username: user.login,
              avatarUrl: user.avatarUrl,
              expiresAt: user.expiresAt,
            }
            authRepo.saveToken(updated)
            token = updated
          } catch {
            // Best effort — don't block dashboard load
          }
        }

        const pinned = cardService.getPinned()
        const results = await Promise.allSettled(
          pinned.map((fullName) =>
            cardService.getCard(fullName, new Set(['prs', 'commits', 'ci'])),
          ),
        )
        const cards = results
          .filter((r): r is PromiseFulfilledResult<CardData> => r.status === 'fulfilled')
          .map((r) => r.value)
        const vms = cards.map(toCardViewModel)
        const severity =
          token.expiresAt instanceof Date ? getPatExpirySeverity(token.expiresAt, new Date()) : null
        return html(
          renderDashboard(
            renderCards(vms),
            token.username,
            token.avatarUrl,
            token.expiresAt instanceof Date ? token.expiresAt : null,
            severity,
          ),
        )
      },
    },
    // GET /api/cards — HTMX partial for all cards
    {
      match: (url, method) => url.pathname === '/api/cards' && method === 'GET',
      async handle() {
        const pinned = cardService.getPinned()
        const results = await Promise.allSettled(
          pinned.map((fullName) =>
            cardService.getCard(fullName, new Set(['prs', 'commits', 'ci'])),
          ),
        )
        const cards = results
          .filter((r): r is PromiseFulfilledResult<CardData> => r.status === 'fulfilled')
          .map((r) => r.value)
        return html(renderCards(cards.map(toCardViewModel)))
      },
    },
    // GET /api/card/:owner/:repo — single card
    {
      match: (url, method) => method === 'GET' && /^\/api\/card\/[^/]+\/[^/]+$/.test(url.pathname),
      async handle(_req, url) {
        const [, , , owner, repo] = url.pathname.split('/')
        const fullName = `${owner}/${repo}`
        try {
          const data = await cardService.getCard(fullName, new Set(['prs', 'commits', 'ci']))
          return html(renderCard(toCardViewModel(data)))
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Fehler beim Laden'
          return html(renderCardError(fullName, msg))
        }
      },
    },
    // POST /api/cards/:owner/:repo — pin/unpin toggle
    {
      match: (url, method) =>
        method === 'POST' && /^\/api\/cards\/[^/]+\/[^/]+$/.test(url.pathname),
      handle(_req, url) {
        const [, , , owner, repo] = url.pathname.split('/')
        cardService.togglePin(`${owner}/${repo}`)
        return htmxTrigger('', 'cardsChanged')
      },
    },
    // POST /api/cards/reorder
    {
      match: (url, method) => url.pathname === '/api/cards/reorder' && method === 'POST',
      async handle(req) {
        const body = (await req.json()) as { order: string[] }
        cardService.reorder(body.order)
        return htmxTrigger('', 'cardsChanged')
      },
    },
  ]
}
