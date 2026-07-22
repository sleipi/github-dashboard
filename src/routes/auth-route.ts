import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { GitHubClient } from '../github/github-client.ts'
import { renderSetupPage } from '../templates/page-template.ts'
import type { RouteHandler } from './route-handler.ts'
import { html, redirect } from './route-handler.ts'

export function createAuthRoutes(authRepo: AuthRepo, client: GitHubClient): RouteHandler[] {
  return [
    // GET / — Setup page when not logged in
    {
      match: (url, method) => url.pathname === '/' && method === 'GET' && !authRepo.getToken(),
      handle: () => html(renderSetupPage()),
    },
    // POST /api/auth — Save or delete PAT
    {
      match: (url, method) => url.pathname === '/api/auth' && method === 'POST',
      async handle(req) {
        const form = await req.formData()
        const methodOverride = form.get('_method')

        if (methodOverride === 'DELETE') {
          authRepo.deleteToken()
          return redirect('/')
        }

        const pat = String(form.get('pat') ?? '').trim()
        if (!pat) return html(renderSetupPage('Please enter a token'), 400)

        try {
          authRepo.saveToken({ pat, username: '', avatarUrl: '', expiresAt: undefined })
          const user = await client.getUser()
          authRepo.saveToken({
            pat,
            username: user.login,
            avatarUrl: user.avatarUrl,
            expiresAt: user.expiresAt,
          })

          if (req.headers.get('HX-Request') === 'true') {
            return new Response(null, { status: 200, headers: { 'HX-Redirect': '/' } })
          }
          return redirect('/')
        } catch (e) {
          authRepo.deleteToken()
          const msg = e instanceof Error ? e.message : 'Unknown error'
          return html(renderSetupPage(msg), 401)
        }
      },
    },
  ]
}
