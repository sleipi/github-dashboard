import type { CardRepo } from '../db/cards/card-repo.ts'
import type { GitHubClient, GitHubRepo } from '../github/github-client.ts'
import type { CardService } from '../services/card-service.ts'
import { renderRepoModal, renderRepoRow, toRepoListItem } from '../templates/modal-template.ts'
import { html } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

export function createModalRoutes(
  cardService: CardService,
  cardRepo: CardRepo,
  client: GitHubClient,
): RouteHandler[] {
  return [
    {
      match: (url, method) => url.pathname === '/api/modal/repos' && method === 'GET',
      async handle() {
        const repos = await cardService.getAllRepos()
        const pinned = new Set(cardRepo.getPinned().map((r) => r.fullName))
        return html(renderRepoModal(repos, pinned))
      },
    },
    {
      match: (url, method) => url.pathname === '/api/repos/search' && method === 'GET',
      async handle(_req, url) {
        const q = url.searchParams.get('q')?.trim() ?? ''
        const pinned = new Set(cardRepo.getPinned().map((r) => r.fullName))
        let results: GitHubRepo[] = []
        if (q.length >= 2) {
          try {
            results = await client.searchRepos(q)
          } catch {
            results = []
          }
        } else {
          results = await cardService.getAllRepos()
        }
        return html(
          results.map((r) => renderRepoRow(toRepoListItem(r, pinned.has(r.fullName)))).join(''),
        )
      },
    },
  ]
}
