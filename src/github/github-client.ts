// src/github/github-client.ts
import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { CiStatus, Label } from '../db/types.ts'

export type GitHubUser = {
  readonly login: string
  readonly avatarUrl: string
  readonly expiresAt: Date | null
}

export type GitHubRepo = {
  readonly fullName: string
  readonly name: string
  readonly owner: string
  readonly isPrivate: boolean
  readonly language: string | null
  readonly stargazersCount: number
  readonly updatedAt: string
}

export type GitHubPr = {
  readonly number: number
  readonly title: string
  readonly draft: boolean
  readonly headSha: string
  readonly htmlUrl: string
  readonly creator: string
  readonly labels: ReadonlyArray<Label>
  readonly createdAt: string
  readonly updatedAt: string
}

export type GitHubEvent = {
  readonly id: string
  readonly type: string
  readonly actor: { readonly login: string }
  readonly payload: Record<string, unknown>
  readonly repo: { readonly name: string }
  readonly createdAt: string
}

export type GitHubDependabotAlert = {
  readonly number: number
  readonly ecosystem: string
  readonly packageName: string
  readonly summary: string
  readonly severity: string
  readonly cvssScore: number | null
  readonly htmlUrl: string
  readonly createdAt: string
}

export type RepoEventsResult =
  | { readonly notModified: true }
  | {
      readonly events: readonly GitHubEvent[]
      readonly etag: string
      readonly pollIntervalSecs: number
    }

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export interface GitHubClient {
  getUser(): Promise<GitHubUser>
  getRepos(): Promise<GitHubRepo[]>
  searchRepos(q: string): Promise<GitHubRepo[]>
  getUserOrgs(): Promise<string[]>
  getPrs(fullName: string): Promise<GitHubPr[]>
  getLastCommitDate(fullName: string): Promise<Date | null>
  getCiStatus(fullName: string, sha: string): Promise<CiStatus>
  getRepoEvents(fullName: string, etag?: string): Promise<RepoEventsResult>
  getDependabotAlerts(fullName: string): Promise<GitHubDependabotAlert[]>
}

export function createGitHubClient(
  authRepo: AuthRepo,
  fetchFn: FetchFn = globalThis.fetch,
): GitHubClient {
  function authHeaders(): Record<string, string> {
    const token = authRepo.getToken()
    if (!token) throw new Error('Not authenticated')
    return {
      Authorization: `token ${token.pat}`,
      Accept: 'application/vnd.github.v3+json',
    }
  }

  async function gfetch(path: string): Promise<unknown> {
    const res = await fetchFn(`https://api.github.com${path}`, { headers: authHeaders() })
    if (res.status === 401) throw new Error('Invalid token (401)')
    if (res.status === 403) {
      const j = (await res.json().catch(() => ({}))) as { message?: string }
      throw new Error(j.message ?? 'Access denied (403)')
    }
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string }
      throw new Error(j.message ?? `API error ${res.status}`)
    }
    return res.json()
  }

  return {
    async getUser() {
      const token = authRepo.getToken()
      if (!token) throw new Error('Not authenticated')
      const res = await fetchFn('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token.pat}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })
      if (res.status === 401) throw new Error('Invalid token (401)')
      if (res.status === 403) {
        const j = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(j.message ?? 'Access denied (403)')
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(j.message ?? `API error ${res.status}`)
      }
      const d = (await res.json()) as { login: string; avatar_url: string }
      const expiryHeader = res.headers.get('GitHub-Authentication-Token-Expiration')
      const expiresAt = expiryHeader ? new Date(expiryHeader) : null
      return { login: d.login, avatarUrl: d.avatar_url, expiresAt }
    },

    async getRepos() {
      const pages = await Promise.all([
        gfetch('/user/repos?per_page=100&sort=updated&page=1') as Promise<unknown[]>,
        gfetch('/user/repos?per_page=100&sort=updated&page=2').catch(() => []) as Promise<
          unknown[]
        >,
        gfetch('/user/repos?per_page=100&sort=updated&page=3').catch(() => []) as Promise<
          unknown[]
        >,
      ])
      return pages.flat().map((r) => {
        const repo = r as {
          full_name: string
          name: string
          owner: { login: string }
          private: boolean
          language: string | null
          stargazers_count: number
          updated_at: string
        }
        return {
          fullName: repo.full_name,
          name: repo.name,
          owner: repo.owner.login,
          isPrivate: repo.private,
          language: repo.language,
          stargazersCount: repo.stargazers_count,
          updatedAt: repo.updated_at,
        }
      })
    },

    async searchRepos(q) {
      const data = (await gfetch(
        `/search/repositories?q=${encodeURIComponent(q)}&sort=updated&per_page=30`,
      )) as {
        items: Array<{
          full_name: string
          name: string
          owner: { login: string }
          private: boolean
          language: string | null
          stargazers_count: number
          updated_at: string
        }>
      }
      return data.items.map((r) => ({
        fullName: r.full_name,
        name: r.name,
        owner: r.owner.login,
        isPrivate: r.private,
        language: r.language,
        stargazersCount: r.stargazers_count,
        updatedAt: r.updated_at,
      }))
    },

    async getUserOrgs() {
      const data = (await gfetch('/user/orgs?per_page=100')) as Array<{ login: string }>
      return data.map((o) => o.login)
    },

    async getPrs(fullName) {
      const data = (await gfetch(
        `/repos/${fullName}/pulls?state=open&per_page=30&sort=updated`,
      )) as Array<{
        number: number
        title: string
        draft: boolean
        head: { sha: string }
        html_url: string
        user: { login: string }
        labels: Array<{ name: string; color: string }>
        created_at: string
        updated_at: string
      }>
      return data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        draft: !!pr.draft,
        headSha: pr.head.sha,
        htmlUrl: pr.html_url,
        creator: pr.user.login,
        labels: pr.labels.map((l) => ({ name: l.name, color: l.color })),
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      }))
    },

    async getLastCommitDate(fullName) {
      const data = (await gfetch(`/repos/${fullName}/commits?per_page=1`)) as Array<{
        commit: { committer: { date: string } | null }
      }>
      const date = data[0]?.commit?.committer?.date
      return date ? new Date(date) : null
    },

    async getCiStatus(fullName, sha) {
      try {
        const cr = (await gfetch(`/repos/${fullName}/commits/${sha}/check-runs`)) as {
          check_runs: Array<{ status: string; conclusion: string | null }>
        }
        const runs = cr.check_runs
        if (runs.length === 0) {
          const st = (await gfetch(`/repos/${fullName}/commits/${sha}/status`)) as { state: string }
          if (st.state === 'success') return 'success'
          if (st.state === 'failure') return 'failure'
          if (st.state === 'pending') return 'pending'
          return 'unknown'
        }
        if (!runs.every((r) => r.status === 'completed')) return 'pending'
        const failed = ['failure', 'timed_out', 'cancelled', 'action_required']
        if (runs.some((r) => r.conclusion && failed.includes(r.conclusion))) return 'failure'
        return 'success'
      } catch {
        return 'unknown'
      }
    },

    async getRepoEvents(fullName, etag) {
      const headers: Record<string, string> = { ...authHeaders() }
      if (etag) headers['If-None-Match'] = etag
      const res = await fetchFn(`https://api.github.com/repos/${fullName}/events`, { headers })
      if (res.status === 304) return { notModified: true }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(j.message ?? `API error ${res.status}`)
      }
      const raw = (await res.json()) as Array<{
        id: string
        type: string
        actor: { login: string }
        payload: Record<string, unknown>
        repo: { name: string }
        created_at: string
      }>
      const newEtag = res.headers.get('ETag') ?? ''
      const pollIntervalSecs = Number(res.headers.get('X-Poll-Interval') ?? '60')
      const events: GitHubEvent[] = raw.map((e) => ({
        id: e.id,
        type: e.type,
        actor: { login: e.actor.login },
        payload: e.payload,
        repo: { name: e.repo.name },
        createdAt: e.created_at,
      }))
      return { events, etag: newEtag, pollIntervalSecs }
    },

    async getDependabotAlerts(fullName) {
      const token = authRepo.getToken()
      if (!token) return []
      try {
        const res = await fetchFn(
          `https://api.github.com/repos/${fullName}/dependabot/alerts?state=open&per_page=100`,
          {
            headers: {
              Authorization: `token ${token.pat}`,
              Accept: 'application/vnd.github.v3+json',
            },
          },
        )
        if (!res.ok) return []
        const raw = (await res.json()) as Array<{
          number: number
          dependency: { package: { name: string; ecosystem: string } }
          security_advisory: {
            summary: string
            severity: string
            cvss: { score: number } | null
          }
          html_url: string
          created_at: string
        }>
        return raw.map((a) => ({
          number: a.number,
          ecosystem: a.dependency.package.ecosystem,
          packageName: a.dependency.package.name,
          summary: a.security_advisory.summary,
          severity: a.security_advisory.severity,
          cvssScore: a.security_advisory.cvss?.score ?? null,
          htmlUrl: a.html_url,
          createdAt: a.created_at,
        }))
      } catch {
        return []
      }
    },
  }
}
