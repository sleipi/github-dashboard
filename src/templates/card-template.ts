import type { CiStatus } from '../db/types.ts'
import type { CardData } from '../services/card-service.ts'
import {
  aggregateCiStatus,
  ciColor,
  ciLabel,
  depColor,
  escapeHtml,
  formatRelative,
  formatTrend,
} from './formatters.ts'
import type { CardViewModel, PrRowViewModel } from './types.ts'

const MAX_PRS_ON_CARD = 6

function commitBorderStyle(lastCommitAt: Date | null): { borderColor: string; borderGlow: string } {
  if (!lastCommitAt) return { borderColor: '#30363d', borderGlow: '' }
  const ageMs = Date.now() - lastCommitAt.getTime()
  const HOUR = 3_600_000
  const DAY = 86_400_000
  if (ageMs < HOUR) return { borderColor: '#2ea043', borderGlow: '0 0 0 1px #2ea043' }
  if (ageMs < DAY) return { borderColor: '#1a6b32', borderGlow: '0 0 0 1px #1a6b3266' }
  if (ageMs < 3 * DAY) return { borderColor: '#1a4228', borderGlow: '' }
  return { borderColor: '#30363d', borderGlow: '' }
}

export function toCardViewModel(data: CardData): CardViewModel {
  const { fullName, cache, prs, trend } = data
  const [owner = '', name = ''] = fullName.split('/')

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
  }))

  const dep = cache.dependabotCount
  const trendStr = formatTrend(trend)

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
    depDisplay: dep !== null ? String(dep) : '—',
    depColor: depColor(dep),
    depLabel:
      dep === null
        ? 'Dependabot: kein Zugriff'
        : dep === 0
          ? 'Keine Dependabot-Alerts'
          : `${dep} Alert${dep === 1 ? '' : 's'}`,
    depTrend: trendStr,
    hasDepTrend: trendStr.length > 0,
    depCollecting: dep !== null && trendStr.length === 0,
    prs: prRows,
    hasPrs: prRows.length > 0,
    noPrs: prRows.length === 0,
    prTotal: cache.prTotal,
    prMore,
    hasMore: prMore > 0,
    prMoreLabel: prMore === 1 ? '+ 1 weiterer PR' : `+ ${prMore} weitere PRs`,
    ...commitBorderStyle(cache.lastCommitAt),
  }
}

export function renderCard(vm: CardViewModel): string {
  const safeOwner = escapeHtml(vm.owner)
  const safeName = escapeHtml(vm.name)
  const safeFullName = escapeHtml(vm.fullName)
  return `
<div class="card" draggable="true" data-card-name="${safeFullName}"
     style="border-color: ${vm.borderColor}${vm.borderGlow ? `; box-shadow: ${vm.borderGlow}` : ''}">
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
            style="background:transparent;border:none;padding:3px;color:#6e7681;cursor:pointer"
            title="Neu laden">↻</button>
    <button hx-post="/api/cards/${safeOwner}/${safeName}"
            hx-swap="none" hx-on::after-request="htmx.trigger(document.body,'cardsChanged')"
            style="background:transparent;border:none;padding:3px 5px;color:#6e7681;cursor:pointer"
            title="Entfernen">×</button>
  </div>
  <div class="card-body">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;font-size:11px">
      <span style="color:#8b949e">⏱ ${vm.lastCommit}</span>
      ${
        vm.depDisplay !== '—'
          ? `
      <a href="${vm.securityUrl}" target="_blank" rel="noopener noreferrer"
         style="color:${vm.depColor};display:flex;align-items:center;gap:4px;text-decoration:none"
         title="${vm.depLabel}">
        🛡 ${vm.depDisplay}
        ${vm.hasDepTrend ? `<span style="font-size:10px;color:#6e7681">${vm.depTrend}</span>` : ''}
        ${vm.depCollecting ? `<span style="font-size:10px;color:#484f58" title="Verlauf wird aufgebaut">···</span>` : ''}
      </a>`
          : ''
      }
    </div>
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
          .map(
            (pr) => `
        <a href="${pr.prUrl}" target="_blank" rel="noopener noreferrer" class="pr-row">
          <div class="ci-dot" style="background:${pr.ciColor}" title="${pr.ciLabel}"></div>
          <span style="font-size:10px;color:#6e7681;font-family:monospace">#${pr.number}</span>
          <span style="font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${escapeHtml(pr.title)}</span>
          ${pr.draft ? '<span class="badge">Draft</span>' : ''}
        </a>`,
          )
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
      <div style="font-size:12px;color:#8b949e;padding:5px">✓ Keine offenen PRs</div>`
      }
    </div>
  </div>
</div>`
}

export function renderCards(vms: CardViewModel[]): string {
  if (vms.length === 0) {
    return `<div style="display:flex;flex-direction:column;align-items:center;padding:60px 20px;text-align:center;color:#8b949e">
      <h2 style="color:#e6edf3;margin:0 0 8px">Noch keine Repos gepinnt</h2>
      <p style="margin:0 0 24px">Klicke auf "Repo hinzufügen" um loszulegen.</p>
    </div>`
  }
  return `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">
    ${vms.map(renderCard).join('')}
  </div>`
}
