import type { Activity } from '../db/types.ts'
import { escapeHtml, formatRelative } from './formatters.ts'

export function renderActivityModal(fullName: string, activities: Activity[]): string {
  const now = new Date()
  const safeFullName = escapeHtml(fullName)
  return `
<div class="modal-overlay"
     onclick="if(event.target===this)document.getElementById('modal').innerHTML=''">
  <div class="modal" style="width:55%;max-width:none" onclick="event.stopPropagation()">
    <div style="padding:14px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:14px;font-weight:600;flex:1">
        Activity &nbsp;<span style="color:#6e7681;font-weight:400">${safeFullName}</span>
      </span>
      <button onclick="document.getElementById('modal').innerHTML=''"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    <div style="overflow-y:auto;flex:1;max-height:70vh">
      ${
        activities.length === 0
          ? '<div style="padding:20px;color:#8b949e;font-size:13px">No recent activity.</div>'
          : activities
              .map(
                (a) => `
      <a href="${escapeHtml(a.linkUrl)}" target="_blank" rel="noopener noreferrer"
         style="display:flex;align-items:baseline;gap:10px;padding:9px 16px;
                border-bottom:1px solid #21262d;text-decoration:none;color:inherit"
         onmouseover="this.style.background='#1c2128'" onmouseout="this.style.background=''">
        <span style="font-size:12px;color:#c9d1d9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">
          ${escapeHtml(`${a.actor} ${a.subject}`)}
        </span>
        <span style="font-size:11px;color:#6e7681;flex-shrink:0">${formatRelative(a.occurredAt, now)}</span>
      </a>`,
              )
              .join('')
      }
    </div>
  </div>
</div>`
}
