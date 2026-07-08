import type { SecurityAlertsRepo } from '../db/security/security-alerts-repo.ts'
import type { SlaRepo } from '../db/sla/sla-repo.ts'
import {
  renderSecurityModal,
  toSecurityModalViewModel,
} from '../templates/security-modal-template.ts'
import { html } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

export function createSecurityRoutes(
  securityRepo: SecurityAlertsRepo,
  slaRepo: SlaRepo,
): RouteHandler[] {
  return [
    {
      match: (url, method) =>
        method === 'GET' && /^\/api\/security\/[^/]+\/[^/]+$/.test(url.pathname),
      handle(_req, url) {
        const [, , , owner, repo] = url.pathname.split('/')
        const fullName = `${owner}/${repo}`
        const alerts = securityRepo.getAlerts(fullName)
        const sla = slaRepo.getSla()
        const now = new Date()
        const vm = toSecurityModalViewModel(fullName, alerts, sla, now)
        return html(renderSecurityModal(vm))
      },
    },
  ]
}
