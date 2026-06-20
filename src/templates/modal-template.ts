import type { GitHubRepo } from '../github/github-client.ts'
import { formatRelative } from './formatters.ts'
import type { RepoListItemViewModel } from './types.ts'

export function toRepoListItem(repo: GitHubRepo, isPinned: boolean): RepoListItemViewModel {
  return {
    fullName: repo.fullName,
    name: repo.name,
    owner: repo.owner,
    isPinned,
    isPrivate: repo.isPrivate,
    language: repo.language,
    starsDisplay: repo.stargazersCount > 0 ? String(repo.stargazersCount) : null,
    updatedAt: formatRelative(new Date(repo.updatedAt)),
  }
}

function renderRepoRow(vm: RepoListItemViewModel): string {
  return `
<div data-repo-name="${vm.fullName}"
     style="display:flex;align-items:center;gap:12px;padding:10px 16px;
            border-bottom:1px solid #21262d;cursor:pointer"
     hx-post="/api/cards/${vm.owner}/${vm.name}"
     hx-swap="none"
     hx-on::after-request="htmx.trigger(document.body,'cardsChanged')"
     onclick="this.querySelector('.check').style.background = this.querySelector('.check').style.background === 'rgb(35,134,54)' ? 'transparent' : '#238636'">
  <div class="check" style="width:16px;height:16px;border-radius:3px;flex-shrink:0;
       border:1.5px solid ${vm.isPinned ? '#238636' : '#30363d'};
       background:${vm.isPinned ? '#238636' : 'transparent'};
       display:flex;align-items:center;justify-content:center">
    ${vm.isPinned ? '<svg width="9" height="9" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>' : ''}
  </div>
  <div style="flex:1;min-width:0">
    <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      <span style="color:#6e7681">${vm.owner}/</span><span style="font-weight:500">${vm.name}</span>
      ${vm.isPrivate ? '<span class="badge" style="margin-left:6px">Privat</span>' : ''}
    </div>
    <div style="font-size:11px;color:#6e7681;margin-top:2px">
      ${vm.updatedAt}${vm.language ? ` · ${vm.language}` : ''}
    </div>
  </div>
  ${vm.starsDisplay ? `<span style="font-size:11px;color:#8b949e">★ ${vm.starsDisplay}</span>` : ''}
</div>`
}

export function renderRepoModal(repos: GitHubRepo[], pinned: Set<string>): string {
  const items = repos.slice(0, 100).map((r) => toRepoListItem(r, pinned.has(r.fullName)))
  return `
<div class="modal-overlay" onclick="if(event.target===this)document.getElementById('modal').innerHTML=''">
  <div class="modal" onclick="event.stopPropagation()">
    <div style="padding:15px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:15px;font-weight:600;flex:1">Repos verwalten</span>
      <button onclick="document.getElementById('modal').innerHTML=''"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    <div style="padding:10px 14px;border-bottom:1px solid #21262d">
      <input id="repo-search" type="text" placeholder="Repo suchen…"
             style="width:100%;background:#0d1117;border:1px solid #30363d;border-radius:6px;
                    padding:7px 11px;color:#e6edf3;font-size:13px;outline:none"/>
    </div>
    <div style="overflow-y:auto;flex:1">
      ${items.map(renderRepoRow).join('')}
    </div>
  </div>
</div>`
}
