import type { Activity } from '../db/types.ts'
import { escapeHtml, formatRelative } from './formatters.ts'
import type { ActivityModalItem, ActivityModalViewModel } from './types.ts'

export function toActivityModalViewModel(
  fullName: string,
  activities: Activity[],
  now: Date,
): ActivityModalViewModel {
  return {
    fullName,
    hasActivities: activities.length > 0,
    activities: activities.map(
      (a): ActivityModalItem => ({
        linkUrl: a.linkUrl,
        text: `${a.actor} ${a.subject}`,
        timeAgo: formatRelative(a.occurredAt, now),
      }),
    ),
  }
}

export function renderActivityModal(fullName: string, activities: Activity[]): string {
  const vm = toActivityModalViewModel(fullName, activities, new Date())
  const safeFullName = escapeHtml(vm.fullName)
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
        vm.hasActivities
          ? vm.activities
              .map(
                (a) => `
      <a href="${escapeHtml(a.linkUrl)}" target="_blank" rel="noopener noreferrer"
         style="display:flex;align-items:baseline;gap:10px;padding:9px 16px;
                border-bottom:1px solid #21262d;text-decoration:none;color:inherit"
         onmouseover="this.style.background='#1c2128'" onmouseout="this.style.background=''">
        <span style="font-size:12px;color:#c9d1d9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">
          ${escapeHtml(a.text)}
        </span>
        <span style="font-size:11px;color:#6e7681;flex-shrink:0">${a.timeAgo}</span>
      </a>`,
              )
              .join('')
          : '<div style="padding:20px;color:#8b949e;font-size:13px">No recent activity.</div>'
      }
    </div>
  </div>
</div>`
}
