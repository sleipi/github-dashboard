import type { SecurityAlertsRepo } from '../db/security/security-alerts-repo.ts'
import type { SlaRepo } from '../db/sla/sla-repo.ts'
import {
  renderSecurityModal,
  renderSlaSettingsModal,
  toSecurityModalViewModel,
} from '../templates/security-modal-template.ts'
import type { RouteHandler } from './route-handler.ts'
import { html } from './route-handler.ts'

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
    {
      match: (url, method) => url.pathname === '/api/settings/sla' && method === 'GET',
      handle() {
        const sla = slaRepo.getSla()
        return html(renderSlaSettingsModal(sla))
      },
    },
    {
      match: (url, method) => url.pathname === '/api/settings/sla' && method === 'POST',
      async handle(req) {
        const body = await req.formData()
        const parse = (key: string, fallback: number): number => {
          const val = Number.parseInt(body.get(key)?.toString() ?? '', 10)
          return Number.isFinite(val) && val > 0 ? val : fallback
        }
        const current = slaRepo.getSla()
        slaRepo.setSla({
          critical: parse('sla_critical_days', current.critical),
          high: parse('sla_high_days', current.high),
          medium: parse('sla_medium_days', current.medium),
          low: parse('sla_low_days', current.low),
        })
        return new Response('', {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'HX-Trigger': 'cardsChanged',
          },
        })
      },
    },
  ]
}
