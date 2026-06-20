import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { CardService } from '../services/card-service.ts'
import { renderCard, renderCards, toCardViewModel } from '../templates/card-template.ts'
import { renderDashboard } from '../templates/page-template.ts'
import { html, htmxTrigger, redirect } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

export function createCardRoutes(cardService: CardService, authRepo: AuthRepo): RouteHandler[] {
  return [
    // GET / — vollständiges Dashboard
    {
      match: (url, method) => url.pathname === '/' && method === 'GET',
      async handle() {
        const token = authRepo.getToken()
        if (!token) return redirect('/')
        const cards = await cardService.getCards()
        const vms = cards.map(toCardViewModel)
        return html(renderDashboard(renderCards(vms), token.username))
      },
    },
    // GET /api/cards — HTMX Partial für alle Cards
    {
      match: (url, method) => url.pathname === '/api/cards' && method === 'GET',
      async handle() {
        const cards = await cardService.getCards()
        return html(renderCards(cards.map(toCardViewModel)))
      },
    },
    // GET /api/card/:owner/:repo — einzelne Card
    {
      match: (url, method) => method === 'GET' && /^\/api\/card\/[^/]+\/[^/]+$/.test(url.pathname),
      async handle(_req, url) {
        const [, , , owner, repo] = url.pathname.split('/')
        const fullName = `${owner}/${repo}`
        const data = await cardService.getCard(fullName)
        return html(renderCard(toCardViewModel(data)))
      },
    },
    // POST /api/cards/:owner/:repo — Pin/Unpin toggle
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
