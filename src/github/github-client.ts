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

export type PendingDeployment = {
  readonly runId: number
  readonly name: string
  readonly htmlUrl: string
  readonly actor: string
  readonly headBranch: string
  readonly waitingSince: string
}

export type RepoEventsResult =
  | { readonly notModified: true }
  | {
      readonly events: readonly GitHubEvent[]
      readonly etag: string
      readonly pollIntervalSecs: number
    }

export type RateLimitStatus = {
  readonly limit: number
  readonly remaining: number
  readonly resetAt: Date
}

export class RateLimitError extends Error {
  constructor(readonly resumesAt: Date) {
    super(`GitHub rate limit reached, resumes at ${resumesAt.toLocaleTimeString('en-GB')}`)
    this.name = 'RateLimitError'
  }
}

const MAX_CACHED_RESPONSES = 1000

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
  getPendingDeployments(fullName: string): Promise<PendingDeployment[]>
  getRateLimit(): RateLimitStatus | null
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

  // ETag cache: GitHub answers a matching If-None-Match with 304, which does not count
  // against the rate limit. Insertion order doubles as eviction order.
  const etagCache = new Map<string, { etag: string; body: unknown }>()
  let rateLimit: RateLimitStatus | null = null
  let blockedUntilMs = 0

  function rememberResponse(url: string, etag: string, body: unknown): void {
    etagCache.delete(url)
    etagCache.set(url, { etag, body })
    if (etagCache.size > MAX_CACHED_RESPONSES) {
      const oldest = etagCache.keys().next().value
      if (oldest !== undefined) etagCache.delete(oldest)
    }
  }

  function guard(): void {
    if (Date.now() < blockedUntilMs) throw new RateLimitError(new Date(blockedUntilMs))
  }

  function observe(res: Response): void {
    const remaining = res.headers.get('x-ratelimit-remaining')
    const reset = res.headers.get('x-ratelimit-reset')
    if (remaining !== null && reset !== null) {
      rateLimit = {
        limit: Number(res.headers.get('x-ratelimit-limit')) || rateLimit?.limit || 5000,
        remaining: Number(remaining),
        resetAt: new Date(Number(reset) * 1000),
      }
      if (Number(remaining) === 0) blockedUntilMs = Number(reset) * 1000
    }
    const retryAfter = Number(res.headers.get('retry-after'))
    if ((res.status === 403 || res.status === 429) && retryAfter > 0) {
      blockedUntilMs = Date.now() + retryAfter * 1000
    }
  }

  type Fetched = { readonly ok: boolean; readonly status: number; readonly body: unknown }

  async function request(url: string): Promise<Fetched> {
    guard()
    const cached = etagCache.get(url)
    const headers = authHeaders()
    if (cached) headers['If-None-Match'] = cached.etag
    const res = await fetchFn(url, { headers })
    observe(res)
    if (res.status === 304 && cached) return { ok: true, status: 200, body: cached.body }
    if (!res.ok) {
      guard()
      return { ok: false, status: res.status, body: await res.json().catch(() => ({})) }
    }
    const body = await res.json()
    const etag = res.headers.get('ETag')
    if (etag) rememberResponse(url, etag, body)
    return { ok: true, status: res.status, body }
  }

  async function gfetch(path: string): Promise<unknown> {
    const r = await request(`https://api.github.com${path}`)
    if (r.ok) return r.body
    const message = (r.body as { message?: string }).message
    if (r.status === 401) throw new Error('Invalid token (401)')
    if (r.status === 403) throw new Error(message ?? 'Access denied (403)')
    throw new Error(message ?? `API error ${r.status}`)
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
      } catch (err) {
        if (err instanceof RateLimitError) throw err
        return 'unknown'
      }
    },

    async getRepoEvents(fullName, etag) {
      const headers: Record<string, string> = { ...authHeaders() }
      if (etag) headers['If-None-Match'] = etag
      guard()
      const res = await fetchFn(`https://api.github.com/repos/${fullName}/events`, { headers })
      observe(res)
      if (res.status === 304) return { notModified: true }
      if (!res.ok) {
        guard()
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
      if (!authRepo.getToken()) return []
      try {
        const r = await request(
          `https://api.github.com/repos/${fullName}/dependabot/alerts?state=open&per_page=100`,
        )
        if (!r.ok) return []
        const raw = r.body as Array<{
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
      } catch (err) {
        if (err instanceof RateLimitError) throw err
        return []
      }
    },

    async getPendingDeployments(fullName) {
      if (!authRepo.getToken()) return []
      try {
        const r = await request(
          `https://api.github.com/repos/${fullName}/actions/runs?status=waiting&per_page=20`,
        )
        if (!r.ok) return []
        const data = r.body as {
          workflow_runs: Array<{
            id: number
            name: string | null
            html_url: string
            head_branch: string
            actor: { login: string } | null
            run_started_at: string | null
            created_at: string
          }>
        }
        return data.workflow_runs.map((run) => ({
          runId: run.id,
          name: run.name ?? 'workflow',
          htmlUrl: run.html_url,
          actor: run.actor?.login ?? 'unknown',
          headBranch: run.head_branch,
          waitingSince: run.run_started_at ?? run.created_at,
        }))
      } catch (err) {
        if (err instanceof RateLimitError) throw err
        return []
      }
    },

    getRateLimit() {
      return rateLimit
    },
  }
}
