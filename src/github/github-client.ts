// src/github/github-client.ts
import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { CiStatus, Label } from '../db/types.ts'

export type GitHubUser = {
  readonly login: string
  readonly avatarUrl: string
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
    if (!res.ok) throw new Error(`API-Fehler ${res.status}`)
    return res.json()
  }

  return {
    async getUser() {
      const d = (await gfetch('/user')) as { login: string; avatar_url: string }
      return { login: d.login, avatarUrl: d.avatar_url }
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
      try {
        const alerts = (await gfetch(
          `/repos/${fullName}/dependabot/alerts?state=open&per_page=100`,
        )) as unknown[]
        return Array.isArray(alerts) ? alerts.length : null
      } catch {
        return null
      }
    },
  }
}
