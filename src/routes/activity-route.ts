import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { ActivityService } from '../services/activity-service.ts'
import { renderActivityModal } from '../templates/activity-template.ts'
import { html } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

export function createActivityRoutes(
  activityService: ActivityService,
  authRepo: AuthRepo,
): RouteHandler[] {
  return [
    {
      match: (url, method) =>
        method === 'GET' && /^\/api\/activity\/[^/]+\/[^/]+$/.test(url.pathname),
      async handle(_req, url) {
        if (!authRepo.getToken()) return new Response('Unauthorized', { status: 401 })
        const [, , , owner, repo] = url.pathname.split('/')
        const fullName = `${owner}/${repo}`
        const { activities } = await activityService.sync(fullName)
        return html(renderActivityModal(fullName, [...activities]))
      },
    },
  ]
}
