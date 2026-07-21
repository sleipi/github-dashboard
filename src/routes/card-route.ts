import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { GitHubClient } from '../github/github-client.ts'
import type { ActivityService } from '../services/activity-service.ts'
import type { CardService } from '../services/card-service.ts'
import { getPatExpirySeverity } from '../services/pat-expiry-service.ts'
import {
  renderCard,
  renderCardError,
  renderCards,
  sortCardsByActivity,
  toCardViewModel,
} from '../templates/card-template.ts'
import {
  renderAutoSortToggle,
  renderDashboard,
  toDashboardViewModel,
} from '../templates/page-template.ts'
import { html, htmlWithTrigger, htmxTrigger, redirect } from './route-handler.ts'
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

function orderVms(
  vms: ReturnType<typeof toCardViewModel>[],
  autoSortEnabled: boolean,
): ReturnType<typeof toCardViewModel>[] {
  return autoSortEnabled ? sortCardsByActivity(vms) : vms
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
        const autoSortEnabled = cardService.isAutoSortEnabled()
        const orderedVms = orderVms(vms, autoSortEnabled)

        const severity =
          token.expiresAt instanceof Date ? getPatExpirySeverity(token.expiresAt, new Date()) : null
        return html(
          renderDashboard(
            toDashboardViewModel(
              renderCards(orderedVms),
              token.username,
              token.avatarUrl,
              token.expiresAt instanceof Date ? token.expiresAt : null,
              severity,
              autoSortEnabled,
            ),
          ),
        )
      },
    },
    // GET /api/cards — HTMX partial for all cards
    {
      match: (url, method) => url.pathname === '/api/cards' && method === 'GET',
      async handle(req) {
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
        const orderedVms = orderVms(vms, cardService.isAutoSortEnabled())

        const rawTs = req.headers.get('X-Last-Seen-Event-At')
        const sinceMs = rawTs !== null ? Number(rawTs) : 0
        const since = new Date(Number.isFinite(sinceMs) ? sinceMs : 0)
        const newCount = activityService.countNewSince(since)
        const cardsHtml = renderCards(orderedVms)

        return newCount > 0
          ? htmlWithTrigger(cardsHtml, { newEvents: { count: newCount } })
          : html(cardsHtml)
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
    // POST /api/settings/auto-sort — toggle auto-sort display mode
    {
      match: (url, method) => url.pathname === '/api/settings/auto-sort' && method === 'POST',
      handle() {
        const newState = !cardService.isAutoSortEnabled()
        cardService.setAutoSort(newState)
        return htmxTrigger(renderAutoSortToggle(newState), 'cardsChanged')
      },
    },
  ]
}
