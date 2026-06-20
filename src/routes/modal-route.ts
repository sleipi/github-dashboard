import type { CardRepo } from '../db/cards/card-repo.ts'
import type { CardService } from '../services/card-service.ts'
import { renderRepoModal } from '../templates/modal-template.ts'
import { html } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

export function createModalRoutes(cardService: CardService, cardRepo: CardRepo): RouteHandler[] {
  return [
    {
      match: (url, method) => url.pathname === '/api/modal/repos' && method === 'GET',
      async handle() {
        const repos = await cardService.getAllRepos()
        const pinned = new Set(cardRepo.getPinned().map((r) => r.fullName))
        return html(renderRepoModal(repos, pinned))
      },
    },
  ]
}
