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

export interface GitHubClient {
  getUser(): Promise<GitHubUser>
  getRepos(): Promise<GitHubRepo[]>
  getPrs(fullName: string): Promise<GitHubPr[]>
  getLastCommitDate(fullName: string): Promise<Date | null>
  getCiStatus(fullName: string, sha: string): Promise<CiStatus>
  getDependabotCount(fullName: string): Promise<number | null>
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export function createGitHubClient(
  authRepo: AuthRepo,
  fetchFn: FetchFn = globalThis.fetch,
): GitHubClient {
  async function gfetch(path: string): Promise<unknown> {
    const token = authRepo.getToken()
    if (!token) throw new Error('Not authenticated')
    const res = await fetchFn(`https://api.github.com${path}`, {
      headers: {
        Authorization: `token ${token.pat}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })
    if (res.status === 401) throw new Error('Token ungültig (401)')
    if (res.status === 403) {
      const j = (await res.json().catch(() => ({}))) as { message?: string }
      throw new Error(j.message ?? 'Zugriff verweigert (403)')
    }
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { message?: string }
      throw new Error(j.message ?? `API-Fehler ${res.status}`)
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
      if (res.status === 401) throw new Error('Token ungültig (401)')
      if (res.status === 403) {
        const j = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(j.message ?? 'Zugriff verweigert (403)')
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(j.message ?? `API-Fehler ${res.status}`)
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

    async getDependabotCount(fullName) {
      const token = authRepo.getToken()
      if (!token) return null
      try {
        // Dependabot API uses cursor-based pagination via Link header — page= is not supported.
        // Fetches up to 300 open alerts (3 pages × 100).
        let nextUrl: string | null =
          `https://api.github.com/repos/${fullName}/dependabot/alerts?state=open&per_page=100`
        let total = 0
        for (let i = 0; i < 3 && nextUrl !== null; i++) {
          const res = await fetchFn(nextUrl, {
            headers: {
              Authorization: `token ${token.pat}`,
              Accept: 'application/vnd.github.v3+json',
            },
          })
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { message?: string }
            throw new Error(j.message ?? `API-Fehler ${res.status}`)
          }
          const alerts = (await res.json()) as unknown
          if (!Array.isArray(alerts)) break
          total += alerts.length
          const link = res.headers.get('link') ?? ''
          const next = link.match(/<([^>]+)>;\s*rel="next"/)
          nextUrl = next ? (next[1] ?? null) : null
        }
        return total
      } catch {
        return null
      }
    },
  }
}
