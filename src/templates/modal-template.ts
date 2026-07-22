import type { GitHubRepo } from '../github/github-client.ts'
import { escapeHtml, formatRelative } from './formatters.ts'
import type { RepoListItemViewModel } from './types.ts'

const CHECKBOX_SVG =
  '<svg width="9" height="9" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>'

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
    checkboxChecked: isPinned ? '1' : '0',
    checkboxBorderColor: isPinned ? '#238636' : '#30363d',
    checkboxBackground: isPinned ? '#238636' : 'transparent',
    checkboxSvg: isPinned ? CHECKBOX_SVG : '',
    languageDisplay: repo.language ? ` · ${escapeHtml(repo.language)}` : '',
  }
}

export function renderRepoRow(vm: RepoListItemViewModel): string {
  const safeOwner = escapeHtml(vm.owner)
  const safeName = escapeHtml(vm.name)
  const safeFullName = escapeHtml(vm.fullName)
  return `
<div data-repo-name="${safeFullName}"
     style="display:flex;align-items:center;gap:12px;padding:10px 16px;
            border-bottom:1px solid #21262d;cursor:pointer"
     hx-post="/api/cards/${safeOwner}/${safeName}"
     hx-swap="none"
     hx-on::after-request="htmx.trigger(document.body,'cardsChanged')"
     onclick="_toggleCheck(this)">
  <div class="check" data-checked="${vm.checkboxChecked}"
       style="width:16px;height:16px;border-radius:3px;flex-shrink:0;
       border:1.5px solid ${vm.checkboxBorderColor};
       background:${vm.checkboxBackground};
       display:flex;align-items:center;justify-content:center">
    ${vm.checkboxSvg}
  </div>
  <div style="flex:1;min-width:0">
    <div style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      <span style="color:#6e7681">${safeOwner}/</span><span style="font-weight:500">${safeName}</span>
      ${vm.isPrivate ? '<span class="badge" style="margin-left:6px">Private</span>' : ''}
    </div>
    <div style="font-size:11px;color:#6e7681;margin-top:2px">
      ${vm.updatedAt}${vm.languageDisplay}
    </div>
  </div>
  ${vm.starsDisplay ? `<span style="font-size:11px;color:#8b949e">★ ${vm.starsDisplay}</span>` : ''}
</div>`
}

export function renderSearchScopeToggle(enabled: boolean): string {
  const trackBg = enabled ? '#1f6feb' : '#30363d'
  const knobLeft = enabled ? '18px' : '2px'
  return `<button
          id="global-search-toggle"
          hx-post="/api/settings/global-search"
          hx-include="#repo-search"
          hx-target="#repo-search-scope-and-results"
          hx-swap="outerHTML"
          aria-pressed="${enabled}"
          title="${enabled ? 'Global Search: On (all of GitHub)' : 'Global Search: Off (your repos + orgs)'}"
          style="display:inline-flex;align-items:center;gap:6px;background:transparent;border:none;
                 padding:0;cursor:pointer;font-family:inherit;font-size:11px;color:#8b949e">
    <span>Global</span>
    <span style="position:relative;width:34px;height:18px;border-radius:9px;flex-shrink:0;
                 background:${trackBg};transition:background .15s">
      <span style="position:absolute;top:2px;left:${knobLeft};width:14px;height:14px;
                   border-radius:50%;background:#fff;transition:left .15s"></span>
    </span>
  </button>`
}

export function renderSearchScopeAndResults(
  scopeLabel: string,
  enabled: boolean,
  resultsHtml: string,
): string {
  return `<div id="repo-search-scope-and-results">
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:0 16px 8px;font-size:11px;color:#6e7681">
      <span>${escapeHtml(scopeLabel)}</span>
      ${renderSearchScopeToggle(enabled)}
    </div>
    <div id="repo-list" style="overflow-y:auto;flex:1">${resultsHtml}</div>
  </div>`
}

export function renderColorPickerModal(fullName: string, currentColor: string | null): string {
  const [owner = '', name = ''] = fullName.split('/')
  const safeOwner = escapeHtml(owner)
  const safeName = escapeHtml(name)
  const value = currentColor ?? '#3fb950'
  const postPath = `/api/settings/card-color/${safeOwner}/${safeName}`
  const cardSelector = `#card-${safeOwner}-${safeName}`
  const closeModal = "document.getElementById('modal').innerHTML=''"
  return `
<div class="modal-overlay" onclick="if(event.target===this)${closeModal}">
  <div class="modal" onclick="event.stopPropagation()" style="max-width:280px">
    <div style="padding:15px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:15px;font-weight:600;flex:1">Color</span>
      <button onclick="${closeModal}"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    <div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:8px">
        <span id="color-preview" style="width:20px;height:20px;border-radius:50%;flex-shrink:0;
                     border:1px solid #30363d;background:${value}"></span>
        <input id="card-color-input" name="color" type="text" value="${escapeHtml(value)}"
               pattern="^#([0-9a-fA-F]{6})$" maxlength="7"
               oninput="document.getElementById('color-preview').style.background=this.value"
               style="flex:1;background:#0d1117;border:1px solid #30363d;border-radius:6px;
                      padding:7px 11px;color:#e6edf3;font-size:13px;font-family:monospace;outline:none"/>
      </div>
      <button type="button"
              onclick="const c='#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');
                       document.getElementById('card-color-input').value=c;
                       document.getElementById('color-preview').style.background=c"
              style="background:transparent;border:none;color:#2f81f7;font-size:12px;
                     cursor:pointer;padding:0;text-align:left">↻ Choose random color</button>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button type="button"
                hx-post="${postPath}"
                hx-include="#card-color-input"
                hx-target="${cardSelector}" hx-swap="outerHTML"
                hx-on::after-request="${closeModal}"
                style="flex:1;background:#238636;border:none;border-radius:6px;color:#fff;
                       font-size:13px;padding:7px 0;cursor:pointer">Save</button>
        <button type="button"
                hx-post="${postPath}"
                hx-vals='{"color":""}'
                hx-target="${cardSelector}" hx-swap="outerHTML"
                hx-on::after-request="${closeModal}"
                style="flex:1;background:transparent;border:1px solid #30363d;border-radius:6px;
                       color:#8b949e;font-size:13px;padding:7px 0;cursor:pointer">Reset</button>
      </div>
    </div>
  </div>
</div>`
}

export function renderRepoModal(
  repos: GitHubRepo[],
  pinned: Set<string>,
  scopeLabel: string,
  globalSearchEnabled: boolean,
): string {
  const items = repos.map((r) => toRepoListItem(r, pinned.has(r.fullName)))
  return `
<div class="modal-overlay" onclick="if(event.target===this)document.getElementById('modal').innerHTML=''">
  <div class="modal" onclick="event.stopPropagation()">
    <div style="padding:15px 20px;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:10px">
      <span style="font-size:15px;font-weight:600;flex:1">Manage repos</span>
      <button onclick="document.getElementById('modal').innerHTML=''"
              style="background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:20px">×</button>
    </div>
    <div style="padding:10px 14px;border-bottom:1px solid #21262d">
      <input id="repo-search" name="q" type="text" placeholder="Search repos…"
             hx-get="/api/repos/search"
             hx-target="#repo-list"
             hx-swap="innerHTML"
             hx-trigger="input changed delay:300ms"
             style="width:100%;background:#0d1117;border:1px solid #30363d;border-radius:6px;
                    padding:7px 11px;color:#e6edf3;font-size:13px;outline:none"/>
    </div>
    ${renderSearchScopeAndResults(scopeLabel, globalSearchEnabled, items.map(renderRepoRow).join(''))}
  </div>
</div>`
}
