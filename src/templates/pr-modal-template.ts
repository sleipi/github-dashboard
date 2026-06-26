import type { PullRequest } from '../db/types.ts'
import { ageRowStyle, ciColor, ciLabel, escapeHtml, formatRelative } from './formatters.ts'
import type { LabelViewModel, PrModalViewModel, PrRowModalItem } from './types.ts'

function labelStyle(hexColor: string): string {
  const r = Number.parseInt(hexColor.slice(0, 2), 16) || 139
  const g = Number.parseInt(hexColor.slice(2, 4), 16) || 148
  const b = Number.parseInt(hexColor.slice(4, 6), 16) || 158
  return `background:rgba(${r},${g},${b},.15);color:#${hexColor};border:1px solid rgba(${r},${g},${b},.5)`
}

export function toPrModalViewModel(
  fullName: string,
  prs: PullRequest[],
  now: Date,
): PrModalViewModel {
  return {
    fullName,
    prs: prs.map(
      (pr): PrRowModalItem => ({
        prUrl: pr.prUrl,
        number: pr.number,
        title: escapeHtml(pr.title),
        draft: pr.draft,
        ciColor: ciColor(pr.ciStatus),
        ciLabel: ciLabel(pr.ciStatus),
        creator: escapeHtml(pr.creator),
        createdAt: formatRelative(pr.createdAt, now),
        updatedAt: formatRelative(pr.updatedAt, now),
        ageBgStyle: ageRowStyle(pr.createdAt, now),
        labels: pr.labels.map(
          (l): LabelViewModel => ({
            name: escapeHtml(l.name),
            style: labelStyle(l.color),
          }),
        ),
      }),
    ),
  }
}

export function renderPrModal(fullName: string, prs: PullRequest[]): string {
  const vm = toPrModalViewModel(fullName, prs, new Date())
  const safeFullName = escapeHtml(vm.fullName)
  return `
<div class="modal-overlay"
     onclick="if(event.target===this)document.getElementById('modal').innerHTML=''">
  <div class="modal" style="width:60%;max-width:none" onclick="event.stopPropagation()">
    <div style="padding:14px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:14px;font-weight:600;flex:1">
        Pull Requests &nbsp;<span style="color:#6e7681;font-weight:400">${safeFullName}</span>
      </span>
      <button onclick="document.getElementById('modal').innerHTML=''"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    <div style="display:grid;grid-template-columns:76px 1fr 130px 106px 118px;
                padding:7px 16px;border-bottom:1px solid #21262d;
                font-size:10px;font-weight:600;color:#6e7681;text-transform:uppercase">
      <span>#</span><span>Titel</span>
      <span>Ersteller</span><span>Erstellt</span><span>Aktualisiert</span>
    </div>
    <div style="overflow-y:auto;flex:1">
      ${vm.prs
        .map(
          (pr) => `
      <a href="${pr.prUrl}" target="_blank" rel="noopener noreferrer"
         style="display:grid;grid-template-columns:76px 1fr 130px 106px 118px;
                padding:8px 16px;border-bottom:1px solid #21262d;
                text-decoration:none;color:inherit;align-items:center${pr.ageBgStyle ? `;${pr.ageBgStyle}` : ''}"
         onmouseover="this._bg=this.style.background;this.style.background='#1c2128'"
         onmouseout="this.style.background=this._bg||''">
        <div style="display:flex;align-items:center;gap:5px">
          <div class="ci-dot" style="background:${pr.ciColor}" title="${pr.ciLabel}"></div>
          <span style="font-size:11px;color:#6e7681;font-family:monospace">#${pr.number}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;min-width:0;padding-right:12px">
          <span style="font-size:12px;color:#c9d1d9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${pr.title}
          </span>
          ${pr.draft ? '<span class="badge">Draft</span>' : ''}
          ${pr.labels.map((l) => `<span style="font-size:10px;border-radius:20px;padding:1px 7px;${l.style}">${l.name}</span>`).join('')}
        </div>
        <span style="font-size:11px;color:#8b949e">${pr.creator}</span>
        <span style="font-size:11px;color:#8b949e">${pr.createdAt}</span>
        <span style="font-size:11px;color:#8b949e">${pr.updatedAt}</span>
      </a>`,
        )
        .join('')}
    </div>
  </div>
</div>`
}
