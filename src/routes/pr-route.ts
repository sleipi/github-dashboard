import type { PrRepo } from '../db/pull-requests/pr-repo.ts'
import { renderPrModal } from '../templates/pr-modal-template.ts'
import type { RouteHandler } from './route-handler.ts'
import { html } from './route-handler.ts'

export function createPrRoutes(prRepo: PrRepo): RouteHandler[] {
  return [
    {
      match: (url, method) => method === 'GET' && /^\/api\/prs\/[^/]+\/[^/]+$/.test(url.pathname),
      handle(_req, url) {
        const [, , , owner, repo] = url.pathname.split('/')
        const fullName = `${owner}/${repo}`
        const prs = prRepo.getPrs(fullName)
        return html(renderPrModal(fullName, prs))
      },
    },
  ]
}
