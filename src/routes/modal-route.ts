import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { CardRepo } from '../db/cards/card-repo.ts'
import type { GitHubClient, GitHubRepo } from '../github/github-client.ts'
import type { CardService } from '../services/card-service.ts'
import {
  buildScopedQuery,
  buildScopeLabel,
  GLOBAL_SCOPE_LABEL,
} from '../services/search-scope-service.ts'
import {
  renderRepoModal,
  renderRepoRow,
  renderSearchScopeAndResults,
  toRepoListItem,
} from '../templates/modal-template.ts'
import type { RouteHandler } from './route-handler.ts'
import { html } from './route-handler.ts'

async function getOrgLogins(client: GitHubClient): Promise<string[]> {
  try {
    return await client.getUserOrgs()
  } catch {
    return []
  }
}

async function safeGetAllRepos(cardService: CardService): Promise<GitHubRepo[]> {
  try {
    return await cardService.getAllRepos()
  } catch {
    return []
  }
}

async function searchResults(
  q: string,
  client: GitHubClient,
  cardService: CardService,
  authRepo: AuthRepo,
  globalSearchEnabled: boolean,
): Promise<GitHubRepo[]> {
  if (q.length < 2) return safeGetAllRepos(cardService)
  try {
    if (globalSearchEnabled) return await client.searchRepos(q)
    const username = authRepo.getToken()?.username ?? ''
    const orgs = await getOrgLogins(client)
    return await client.searchRepos(buildScopedQuery(q, username, orgs))
  } catch {
    return []
  }
}

function renderResults(results: GitHubRepo[], pinned: Set<string>): string {
  return results.map((r) => renderRepoRow(toRepoListItem(r, pinned.has(r.fullName)))).join('')
}

export function createModalRoutes(
  cardService: CardService,
  cardRepo: CardRepo,
  client: GitHubClient,
  authRepo: AuthRepo,
): RouteHandler[] {
  return [
    {
      match: (url, method) => url.pathname === '/api/modal/repos' && method === 'GET',
      async handle() {
        const repos = await safeGetAllRepos(cardService)
        const pinned = new Set(cardRepo.getPinned().map((r) => r.fullName))
        const globalSearchEnabled = cardService.isGlobalSearchEnabled()
        const username = authRepo.getToken()?.username ?? ''
        const orgs = globalSearchEnabled ? [] : await getOrgLogins(client)
        const scopeLabel = globalSearchEnabled
          ? GLOBAL_SCOPE_LABEL
          : buildScopeLabel(username, orgs)
        return html(renderRepoModal(repos, pinned, scopeLabel, globalSearchEnabled))
      },
    },
    {
      match: (url, method) => url.pathname === '/api/repos/search' && method === 'GET',
      async handle(_req, url) {
        const q = url.searchParams.get('q')?.trim() ?? ''
        const pinned = new Set(cardRepo.getPinned().map((r) => r.fullName))
        const globalSearchEnabled = cardService.isGlobalSearchEnabled()
        const results = await searchResults(q, client, cardService, authRepo, globalSearchEnabled)
        return html(renderResults(results, pinned))
      },
    },
    {
      match: (url, method) => url.pathname === '/api/settings/global-search' && method === 'POST',
      async handle(req, _url) {
        const newState = !cardService.isGlobalSearchEnabled()
        cardService.setGlobalSearchEnabled(newState)

        const form = await req.formData()
        const q = ((form.get('q') as string) ?? '').trim()
        const pinned = new Set(cardRepo.getPinned().map((r) => r.fullName))
        const username = authRepo.getToken()?.username ?? ''
        const orgs = newState ? [] : await getOrgLogins(client)
        const scopeLabel = newState ? GLOBAL_SCOPE_LABEL : buildScopeLabel(username, orgs)
        const results = await searchResults(q, client, cardService, authRepo, newState)

        return html(
          renderSearchScopeAndResults(scopeLabel, newState, renderResults(results, pinned)),
        )
      },
    },
  ]
}
