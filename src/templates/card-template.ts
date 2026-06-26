import type { Activity, CiStatus } from '../db/types.ts'
import type { CardData } from '../services/card-service.ts'
import {
  ageRowStyle,
  aggregateCiStatus,
  ciColor,
  ciLabel,
  depBgColor,
  depColor,
  escapeHtml,
  formatDepBadgeTrend,
  formatDepLabel,
  formatRelative,
} from './formatters.ts'
import type { ActivityItemViewModel, CardViewModel, PrRowViewModel } from './types.ts'

const MAX_PRS_ON_CARD = 5
const MAX_ACTIVITIES_ON_CARD = 5
const HIGHLIGHT_OPACITIES = [0.5, 0.42, 0.33, 0.25, 0.17, 0.08] as const

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
    ageBgStyle: ageRowStyle(a.occurredAt, now),
  }
}

export function toCardViewModel(data: CardData, activities: readonly Activity[]): CardViewModel {
  const { fullName, cache, prs, trend } = data
  const [owner = '', name = ''] = fullName.split('/')
  const now = new Date()

  const displayPrs = prs.slice(0, MAX_PRS_ON_CARD)
  const prMore = Math.max(0, prs.length - displayPrs.length)
  const ciStatuses = prs.map((p) => p.ciStatus) as CiStatus[]
  const overallCi = aggregateCiStatus(ciStatuses)

  const prRows: PrRowViewModel[] = displayPrs.map((pr) => {
    const ageHours = Math.floor((now.getTime() - pr.createdAt.getTime()) / 3_600_000)
    const opacityIdx = ageHours < 6 ? ageHours : null
    const freshStyle =
      opacityIdx !== null ? `background:rgba(34,197,94,${HIGHLIGHT_OPACITIES[opacityIdx]})` : null
    return {
      number: pr.number,
      title: pr.title,
      draft: pr.draft,
      ciColor: ciColor(pr.ciStatus),
      ciLabel: ciLabel(pr.ciStatus),
      prUrl: pr.prUrl,
      highlightStyle: freshStyle ?? ageRowStyle(pr.createdAt, now),
    }
  })

  const dep = cache.dependabotCount ?? 0
  const badgeTrend = formatDepBadgeTrend(trend)

  const displayActivities = activities.slice(0, MAX_ACTIVITIES_ON_CARD)
  const activityMore = Math.max(0, activities.length - MAX_ACTIVITIES_ON_CARD)

  return {
    fullName,
    owner,
    name,
    repoUrl: `https://github.com/${fullName}`,
    securityUrl: `https://github.com/${fullName}/security/dependabot`,
    lastCommit: formatRelative(cache.lastCommitAt),
    ciDotColor: overallCi ? ciColor(overallCi) : 'transparent',
    ciDotLabel: overallCi ? ciLabel(overallCi) : '',
    showCiDot: overallCi !== null,
    depDisplay: dep === 0 ? '✓' : dep >= 100 ? '99+' : String(dep),
    depColor: depColor(dep),
    depBg: depBgColor(dep),
    depLabel: formatDepLabel(dep, trend),
    depBadgeTrend: badgeTrend,
    hasDepBadgeTrend: badgeTrend.length > 0,
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
  }
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
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;font-size:11px">
      <span style="color:#8b949e">⏱ ${vm.lastCommit}</span>
      <a href="${vm.securityUrl}" target="_blank" rel="noopener noreferrer"
         style="display:inline-flex;align-items:center;gap:3px;text-decoration:none;background:${vm.depBg};color:${vm.depColor};padding:2px 7px;border-radius:10px;font-size:11px;font-weight:500"
         title="${vm.depLabel}">
        🛡 ${vm.depDisplay}${vm.hasDepBadgeTrend ? ` <span style="font-size:10px;opacity:0.75">${vm.depBadgeTrend}</span>` : ''}
      </a>
    </div>
    ${
      vm.hasActivities
        ? `
    <div style="border-top:1px solid #21262d;padding-top:7px;margin-bottom:8px;display:flex;flex-direction:column;gap:2px">
      ${vm.activities
        .map(
          (a) => `
      <a href="${escapeHtml(a.linkUrl)}" target="_blank" rel="noopener noreferrer"
         style="display:flex;align-items:baseline;gap:5px;font-size:11px;color:#8b949e;text-decoration:none;padding:1px 4px;border-radius:3px;margin:0 -4px${a.ageBgStyle ? `;${a.ageBgStyle}` : ''}"
         onmouseover="this.style.color='#c9d1d9'" onmouseout="this.style.color='#8b949e'"
         title="${escapeHtml(a.text)} · ${escapeHtml(a.timeAgo)}">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.text)}</span>
        <span style="flex-shrink:0;font-size:10px;color:#484f58">${escapeHtml(a.timeAgo)}</span>
      </a>`,
        )
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
