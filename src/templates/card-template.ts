import type { Activity, CiStatus } from '../db/types.ts'
import type { CardData } from '../services/card-service.ts'
import {
  aggregateCiStatus,
  ciColor,
  ciLabel,
  escapeHtml,
  formatRelative,
  freshAgeStyle,
} from './formatters.ts'
import type { ActivityItemViewModel, CardViewModel, PrRowViewModel } from './types.ts'

const MAX_PRS_ON_CARD = 5
const MAX_ACTIVITIES_ON_CARD = 5

function buildBorderStyle(lastCommitAt: Date | null): string {
  if (!lastCommitAt) return 'border-color:#30363d'
  const ageMs = Date.now() - lastCommitAt.getTime()
  const HOUR = 3_600_000
  const DAY = 86_400_000
  if (ageMs < HOUR) return 'border-color:#2ea043; box-shadow:0 0 0 1px #2ea043'
  if (ageMs < DAY) return 'border-color:#1a6b32; box-shadow:0 0 0 1px #1a6b3266'
  if (ageMs < 3 * DAY) return 'border-color:#1a4228'
  return 'border-color:#30363d'
}

function toActivityItemViewModel(a: Activity, now: Date): ActivityItemViewModel {
  return {
    text: `${a.actor} ${a.subject}`,
    linkUrl: a.linkUrl,
    timeAgo: formatRelative(a.occurredAt, now),
    ageBgStyle: freshAgeStyle(a.occurredAt, now),
  }
}

export function toCardViewModel(data: CardData, activities: readonly Activity[]): CardViewModel {
  const { fullName, cache, prs, securityCounts } = data
  const [owner = '', name = ''] = fullName.split('/')
  const now = new Date()

  const displayPrs = prs.slice(0, MAX_PRS_ON_CARD)
  const prMore = Math.max(0, prs.length - displayPrs.length)
  const ciStatuses = prs.map((p) => p.ciStatus) as CiStatus[]
  const overallCi = aggregateCiStatus(ciStatuses)

  const prRows: PrRowViewModel[] = displayPrs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    draft: pr.draft,
    ciColor: ciColor(pr.ciStatus),
    ciLabel: ciLabel(pr.ciStatus),
    prUrl: pr.prUrl,
    highlightStyle: freshAgeStyle(pr.createdAt, now),
  }))

  const displayActivities = activities.slice(0, MAX_ACTIVITIES_ON_CARD)
  const activityMore = Math.max(0, activities.length - MAX_ACTIVITIES_ON_CARD)

  return {
    fullName,
    owner,
    name,
    repoUrl: `https://github.com/${fullName}`,
    lastCommit: formatRelative(cache.lastCommitAt),
    ciDotColor: overallCi ? ciColor(overallCi) : 'transparent',
    ciDotLabel: overallCi ? ciLabel(overallCi) : '',
    showCiDot: overallCi !== null,
    secCritical: securityCounts.critical,
    secHigh: securityCounts.high,
    secMedium: securityCounts.medium,
    secLow: securityCounts.low,
    secCriticalOverdue: securityCounts.overdueSeverities.has('critical'),
    secHighOverdue: securityCounts.overdueSeverities.has('high'),
    secMediumOverdue: securityCounts.overdueSeverities.has('medium'),
    secLowOverdue: securityCounts.overdueSeverities.has('low'),
    secScopeAvailable: cache.dependabotCount !== null,
    secHasAlerts:
      securityCounts.critical + securityCounts.high + securityCounts.medium + securityCounts.low >
      0,
    activities: displayActivities.map((a) => toActivityItemViewModel(a, now)),
    hasActivities: displayActivities.length > 0,
    activityMore,
    hasActivityMore: activityMore > 0,
    prs: prRows,
    hasPrs: prRows.length > 0,
    noPrs: prRows.length === 0,
    prTotal: cache.prTotal,
    prMore,
    hasMore: prMore > 0,
    prMoreLabel: prMore === 1 ? '+ 1 more PR' : `+ ${prMore} more PRs`,
    loadingId: `ld-${fullName.replace(/[^a-z0-9]/gi, '-')}`,
    borderStyle: buildBorderStyle(cache.lastCommitAt),
    secHtmxPath: `/api/security/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
  }
}

const WARN_ICON =
  `<svg width="10" height="10" viewBox="0 0 16 16" fill="#f85149" style="vertical-align:-1px;margin-left:3px">` +
  `<path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918` +
  `a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM9 11a1 1 0 11-2 0 1 1 0 012 0zm-.25-5.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z"/>` +
  '</svg>'

const SEP = `<span style="color:#8b949e">&nbsp;·&nbsp;</span>`

function renderSecurityBadge(vm: CardViewModel): string {
  if (!vm.secScopeAvailable) {
    return `<span style="color:#6e7681;font-size:11px">Security Alerts —</span>`
  }
  if (!vm.secHasAlerts) {
    return `<span style="font-size:11px;color:#6e7681">Security Alerts${SEP}<span style="color:#3fb950">No Alerts ✓</span></span>`
  }
  const od = (flag: boolean) => (flag ? WARN_ICON : '')
  const parts: string[] = []
  if (vm.secCritical > 0)
    parts.push(
      `<span style="color:#f85149">Critical&nbsp;${vm.secCritical}${od(vm.secCriticalOverdue)}</span>`,
    )
  if (vm.secHigh > 0)
    parts.push(`<span style="color:#d29922">High&nbsp;${vm.secHigh}${od(vm.secHighOverdue)}</span>`)
  if (vm.secMedium > 0)
    parts.push(
      `<span style="color:#d29922">Medium&nbsp;${vm.secMedium}${od(vm.secMediumOverdue)}</span>`,
    )
  if (vm.secLow > 0)
    parts.push(`<span style="color:#6e7681">Low&nbsp;${vm.secLow}${od(vm.secLowOverdue)}</span>`)
  return `<button
    hx-get="${escapeHtml(vm.secHtmxPath)}"
    hx-target="#modal" hx-swap="innerHTML"
    style="display:inline-flex;align-items:center;gap:3px;background:none;border:none;cursor:pointer;padding:0;font-family:inherit;font-size:11px;color:inherit"
    title="View security alerts">
    <span style="color:#6e7681">Security Alerts</span>${SEP}${parts.join(SEP)}
  </button>`
}

export function renderCard(vm: CardViewModel): string {
  const safeOwner = escapeHtml(vm.owner)
  const safeName = escapeHtml(vm.name)
  const safeFullName = escapeHtml(vm.fullName)
  return `
<div class="card" id="card-${safeOwner}-${safeName}" draggable="true" data-card-name="${safeFullName}"
     style="position:relative;${vm.borderStyle}">
  <div id="${vm.loadingId}" class="htmx-indicator"
       style="position:absolute;inset:0;background:rgba(22,27,34,0.88);z-index:10;
              padding:14px;border-radius:8px;display:flex;flex-direction:column;gap:10px;
              justify-content:center">
    <div class="skeleton" style="height:10px;border-radius:3px"></div>
    <div class="skeleton" style="height:10px;width:75%;border-radius:3px"></div>
    <div class="skeleton" style="height:10px;width:55%;border-radius:3px"></div>
  </div>
  <div class="card-header">
    <div style="flex:1;min-width:0;overflow:hidden">
      <a href="${vm.repoUrl}" target="_blank" rel="noopener noreferrer"
         style="text-decoration:none;color:inherit">
        <span style="font-size:11px;color:#6e7681">${safeOwner}/</span><span
          style="font-size:13px;font-weight:600">${safeName}</span>
      </a>
    </div>
    <span style="font-size:10px;color:#484f58;margin-left:auto">${vm.lastCommit}</span>
    ${vm.showCiDot ? `<div class="ci-dot" style="background:${vm.ciDotColor}" title="${vm.ciDotLabel}"></div>` : ''}
    <button hx-get="/api/card/${safeOwner}/${safeName}"
            hx-target="closest .card" hx-swap="outerHTML"
            hx-indicator="#${vm.loadingId}"
            class="refresh-btn"
            style="background:transparent;border:none;padding:3px;color:#6e7681;cursor:pointer"
            title="Refresh">↻</button>
    <button hx-post="/api/cards/${safeOwner}/${safeName}"
            hx-swap="none" hx-on::after-request="htmx.trigger(document.body,'cardsChanged')"
            style="background:transparent;border:none;padding:3px 5px;color:#6e7681;cursor:pointer"
            title="Remove">×</button>
  </div>
  <div class="card-body">
    <div style="margin-bottom:10px;font-size:11px">
      ${renderSecurityBadge(vm)}
    </div>
    ${
      vm.hasActivities
        ? `
    <div style="border-top:1px solid #21262d;padding-top:7px;margin-bottom:8px;display:flex;flex-direction:column;gap:2px">
      ${vm.activities
        .map((a) => {
          const textColor = a.ageBgStyle ? '#c9d1d9' : '#8b949e'
          return `
      <a href="${escapeHtml(a.linkUrl)}" target="_blank" rel="noopener noreferrer"
         style="display:flex;align-items:baseline;gap:5px;font-size:11px;color:${textColor};text-decoration:none;padding:1px 4px;border-radius:3px;margin:0 -4px${a.ageBgStyle ? `;${a.ageBgStyle}` : ''}"
         onmouseover="this.style.color='#c9d1d9'" onmouseout="this.style.color='${textColor}'"
         title="${escapeHtml(a.text)} · ${escapeHtml(a.timeAgo)}">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.text)}</span>
        <span style="flex-shrink:0;font-size:10px;color:#484f58">${escapeHtml(a.timeAgo)}</span>
      </a>`
        })
        .join('')}
      ${
        vm.hasActivityMore
          ? `
      <button hx-get="/api/activity/${safeOwner}/${safeName}"
              hx-target="#modal" hx-swap="innerHTML"
              style="font-size:10px;color:#2f81f7;padding:2px 0;text-align:center;width:100%;background:transparent;border:none;cursor:pointer;font-family:inherit">
        · ${vm.activityMore} more activities
      </button>`
          : ''
      }
    </div>`
        : ''
    }
    <div style="border-top:1px solid #21262d;padding-top:9px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:10px;font-weight:600;color:#6e7681;text-transform:uppercase">Pull Requests</span>
        <span class="badge">${vm.prTotal}</span>
      </div>
      ${
        vm.hasPrs
          ? `
      <div style="display:flex;flex-direction:column;gap:1px">
        ${vm.prs
          .map((pr) => {
            const bgAttr = pr.highlightStyle ? ` style="${pr.highlightStyle}"` : ''
            return `
        <a href="${pr.prUrl}" target="_blank" rel="noopener noreferrer" class="pr-row"${bgAttr}>
          <div class="ci-dot" style="background:${pr.ciColor}" title="${pr.ciLabel}"></div>
          <span style="font-size:10px;color:#6e7681;font-family:monospace">#${pr.number}</span>
          <span style="font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${escapeHtml(pr.title)}</span>
          ${pr.draft ? '<span class="badge">Draft</span>' : ''}
          <svg width="10" height="10" viewBox="0 0 16 16" fill="#6e7681" style="flex-shrink:0"><path d="M10.604 1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.75.75 0 01-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1zM3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"/></svg>
        </a>`
          })
          .join('')}
      </div>
      ${
        vm.hasMore
          ? `
      <button hx-get="/api/prs/${safeOwner}/${safeName}"
              hx-target="#modal" hx-swap="innerHTML"
              style="width:100%;font-size:11px;color:#2f81f7;padding:5px;text-align:center;
                     background:transparent;border:none;cursor:pointer;font-family:inherit">
        ${vm.prMoreLabel}
      </button>`
          : ''
      }
      `
          : `
      <div style="font-size:12px;color:#8b949e;padding:5px">✓ No open PRs</div>`
      }
    </div>
  </div>
</div>`
}

export function renderCardError(fullName: string, message: string): string {
  return `
<div class="card" style="border-color:#f85149">
  <div class="card-header">
    <div style="flex:1;min-width:0;overflow:hidden">
      <span style="font-size:13px;font-weight:600">${escapeHtml(fullName)}</span>
    </div>
  </div>
  <div class="card-body">
    <div style="display:flex;align-items:center;gap:8px;color:#f85149;font-size:12px;padding:4px 0">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM0 8a8 8 0 1116 0A8 8 0 010 8zm8-3.5a.5.5 0 01.5.5v3a.5.5 0 01-1 0V5a.5.5 0 01.5-.5zM7.5 11a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
      </svg>
      <span>${escapeHtml(message)}</span>
    </div>
  </div>
</div>`
}

export function renderCards(vms: CardViewModel[]): string {
  if (vms.length === 0) {
    return `<div style="display:flex;flex-direction:column;align-items:center;padding:60px 20px;text-align:center;color:#8b949e">
      <h2 style="color:#e6edf3;margin:0 0 8px">No repos pinned yet</h2>
      <p style="margin:0 0 24px">Click "+ Add repo" to get started.</p>
    </div>`
  }
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(max(22%,340px),1fr));gap:16px">
    ${vms.map(renderCard).join('')}
  </div>`
}
