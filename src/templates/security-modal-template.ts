import type { SecurityAlert, SlaSettings } from '../db/types.ts'
import { escapeHtml } from './formatters.ts'

export type SecurityAlertRowViewModel = {
  readonly number: number
  readonly ecosystem: string
  readonly title: string
  readonly severity: 'critical' | 'high' | 'medium' | 'low'
  readonly cvssScore: number | null
  readonly ageDays: number
  readonly overdueBy: number | null
  readonly htmlUrl: string
}

export type SecurityModalViewModel = {
  readonly fullName: string
  readonly rows: readonly SecurityAlertRowViewModel[]
  readonly hasAlerts: boolean
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#f85149',
  high: '#d29922',
  medium: '#d29922',
  low: '#8b949e',
}

export function toSecurityModalViewModel(
  fullName: string,
  alerts: readonly SecurityAlert[],
  sla: SlaSettings,
  now: Date,
): SecurityModalViewModel {
  const rows: SecurityAlertRowViewModel[] = alerts.map((a) => {
    const ageDays = (now.getTime() - a.createdAt.getTime()) / 86_400_000
    const slaDays = sla[a.severity]
    const overdueBy = ageDays > slaDays ? Math.floor(ageDays - slaDays) : null
    return {
      number: a.number,
      ecosystem: a.ecosystem,
      title: a.title,
      severity: a.severity,
      cvssScore: a.cvssScore,
      ageDays: Math.floor(ageDays),
      overdueBy,
      htmlUrl: a.htmlUrl,
    }
  })

  const sorted = [...rows].sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    if (sevDiff !== 0) return sevDiff
    const aOverdue = a.overdueBy !== null
    const bOverdue = b.overdueBy !== null
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
    return a.ageDays - b.ageDays
  })

  return { fullName, rows: sorted, hasAlerts: sorted.length > 0 }
}

export function renderSecurityModal(vm: SecurityModalViewModel): string {
  const safeFullName = escapeHtml(vm.fullName)
  const close = `document.getElementById('modal').innerHTML=''`

  const ecosystems = [...new Set(vm.rows.map((r) => r.ecosystem))].sort()
  const ecoFilter =
    vm.hasAlerts && ecosystems.length > 1
      ? `<div style="padding:10px 20px;border-bottom:1px solid #21262d">
    <select onchange="var v=this.value;document.querySelectorAll('tr[data-ecosystem]').forEach(function(r){r.style.display=(!v||r.dataset.ecosystem===v)?'':'none';})"
            style="background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;
                   padding:4px 8px;font-size:12px;cursor:pointer">
      <option value="">All ecosystems</option>
      ${ecosystems.map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('')}
    </select>
  </div>`
      : ''

  return `
<div class="modal-overlay" onclick="if(event.target===this)${close}">
  <div class="modal" style="max-width:760px">
    <div style="padding:15px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:15px;font-weight:600;flex:1">Security Alerts — ${safeFullName}</span>
      <button hx-get="/api/settings/sla" hx-target="#modal" hx-swap="innerHTML"
              style="background:transparent;border:1px solid #30363d;border-radius:6px;color:#6e7681;
                     cursor:pointer;padding:3px 8px;font-size:11px;font-family:inherit"
              title="Configure SLA thresholds">⚙ SLA</button>
      <button onclick="${close}"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    ${ecoFilter}
    <div style="overflow-y:auto;flex:1;padding:20px">
      ${
        !vm.hasAlerts
          ? `<p style="color:#8b949e;font-size:13px">No open security alerts.</p>`
          : `<div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid #30363d;color:#6e7681;text-align:left">
              <th style="padding:6px 8px;font-weight:600">Ecosystem</th>
              <th style="padding:6px 8px;font-weight:600">Title</th>
              <th style="padding:6px 8px;font-weight:600">Severity</th>
              <th style="padding:6px 8px;font-weight:600">Score</th>
              <th style="padding:6px 8px;font-weight:600">Age</th>
            </tr>
          </thead>
          <tbody>
            ${vm.rows.map(renderAlertRow).join('')}
          </tbody>
        </table>
      </div>`
      }
    </div>
  </div>
</div>`
}

function renderAlertRow(row: SecurityAlertRowViewModel): string {
  const rowBg = row.overdueBy !== null ? 'background:rgba(248,81,73,0.08)' : ''
  const severityColor = SEVERITY_COLOR[row.severity] ?? '#8b949e'
  const severityLabel = row.severity.charAt(0).toUpperCase() + row.severity.slice(1)
  const ageText =
    row.overdueBy !== null
      ? `${row.ageDays}d · <span style="color:#f85149;font-weight:600">${row.overdueBy}d over SLA</span>`
      : `${row.ageDays}d`

  return `<tr data-ecosystem="${escapeHtml(row.ecosystem)}" style="border-bottom:1px solid #21262d;${rowBg};cursor:pointer"
    onclick="window.open('${escapeHtml(row.htmlUrl)}','_blank','noopener,noreferrer")">
    <td style="padding:7px 8px;color:#8b949e">${escapeHtml(row.ecosystem)}</td>
    <td style="padding:7px 8px;color:#c9d1d9;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(row.title)}</td>
    <td style="padding:7px 8px"><span style="color:${severityColor};font-weight:600">${severityLabel}</span></td>
    <td style="padding:7px 8px;color:#8b949e;font-family:monospace">${row.cvssScore !== null ? row.cvssScore.toFixed(1) : '—'}</td>
    <td style="padding:7px 8px;color:#8b949e;white-space:nowrap">${ageText}</td>
  </tr>`
}

const INDUSTRY_STANDARD: SlaSettings = { critical: 7, high: 30, medium: 90, low: 180 }

export function renderSlaSettingsModal(current: SlaSettings): string {
  const row = (label: string, key: keyof SlaSettings, inputName: string) => `
  <tr>
    <td style="padding:8px 0;color:#c9d1d9;font-size:13px;width:80px">${label}</td>
    <td style="padding:8px 0">
      <input type="number" name="${inputName}" value="${current[key]}" min="1" max="365"
             style="width:70px;background:#0d1117;border:1px solid #30363d;border-radius:6px;
                    color:#e6edf3;padding:4px 8px;font-size:13px;font-family:inherit"/>
    </td>
    <td style="padding:8px 0 8px 12px;color:#484f58;font-size:11px">
      days &nbsp;·&nbsp; industry standard: ${INDUSTRY_STANDARD[key]} days
    </td>
  </tr>`

  const close = `document.getElementById('modal').innerHTML=''`
  return `
<div class="modal-overlay" onclick="if(event.target===this)${close}">
  <div class="modal">
    <div style="padding:15px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:15px;font-weight:600;flex:1">Security SLA Settings</span>
      <button onclick="${close}"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    <div style="padding:20px">
      <form hx-post="/api/settings/sla" hx-target="#modal" hx-swap="innerHTML">
        <table style="border-collapse:collapse">
          ${row('Critical', 'critical', 'sla_critical_days')}
          ${row('High', 'high', 'sla_high_days')}
          ${row('Medium', 'medium', 'sla_medium_days')}
          ${row('Low', 'low', 'sla_low_days')}
        </table>
        <div style="margin-top:16px">
          <button type="submit"
                  style="background:#238636;border:1px solid rgba(240,246,252,0.1);border-radius:6px;
                         color:#fff;padding:5px 16px;font-size:13px;cursor:pointer;font-family:inherit">
            Save
          </button>
        </div>
      </form>
    </div>
  </div>
</div>`
}
