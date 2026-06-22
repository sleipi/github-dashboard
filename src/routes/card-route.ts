import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { GitHubClient } from '../github/github-client.ts'
import type { ActivityService } from '../services/activity-service.ts'
import type { CardService } from '../services/card-service.ts'
import { getPatExpirySeverity } from '../services/pat-expiry-service.ts'
import {
  renderCard,
  renderCardError,
  renderCards,
  toCardViewModel,
} from '../templates/card-template.ts'
import { renderDashboard, toDashboardViewModel } from '../templates/page-template.ts'
import { html, htmxTrigger, redirect } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

async function buildCardVm(
  fullName: string,
  cardService: CardService,
  activityService: ActivityService,
) {
  const syncResult = await activityService.sync(fullName)
  const cardData = await cardService.getCard(fullName, syncResult.refreshNeeded)
  return toCardViewModel(cardData, syncResult.activities)
}

export function createCardRoutes(
  cardService: CardService,
  activityService: ActivityService,
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
            /* best effort */
          }
        }

        const pinned = cardService.getPinned()
        const results = await Promise.allSettled(
          pinned.map((fullName) => buildCardVm(fullName, cardService, activityService)),
        )
        const vms = results
          .filter(
            (r): r is PromiseFulfilledResult<ReturnType<typeof toCardViewModel>> =>
              r.status === 'fulfilled',
          )
          .map((r) => r.value)

        const severity =
          token.expiresAt instanceof Date ? getPatExpirySeverity(token.expiresAt, new Date()) : null
        return html(
          renderDashboard(
            toDashboardViewModel(
              renderCards(vms),
              token.username,
              token.avatarUrl,
              token.expiresAt instanceof Date ? token.expiresAt : null,
              severity,
            ),
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
          pinned.map((fullName) => buildCardVm(fullName, cardService, activityService)),
        )
        const vms = results
          .filter(
            (r): r is PromiseFulfilledResult<ReturnType<typeof toCardViewModel>> =>
              r.status === 'fulfilled',
          )
          .map((r) => r.value)
        return html(renderCards(vms))
      },
    },
    // GET /api/card/:owner/:repo — single card
    {
      match: (url, method) => method === 'GET' && /^\/api\/card\/[^/]+\/[^/]+$/.test(url.pathname),
      async handle(_req, url) {
        const [, , , owner, repo] = url.pathname.split('/')
        const fullName = `${owner}/${repo}`
        try {
          const syncResult = await activityService.sync(fullName)
          const hints = new Set(syncResult.refreshNeeded)
          hints.add('prs')
          hints.add('ci')
          const cardData = await cardService.getCard(fullName, hints)
          const vm = toCardViewModel(cardData, syncResult.activities)
          return html(renderCard(vm))
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Error loading card'
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
