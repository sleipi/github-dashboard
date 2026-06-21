import type { AuthRepo } from '../db/auth/auth-repo.ts'
import type { GitHubClient } from '../github/github-client.ts'
import { renderSetupPage } from '../templates/page-template.ts'
import { html, redirect } from './route-handler.ts'
import type { RouteHandler } from './route-handler.ts'

export function createAuthRoutes(authRepo: AuthRepo, client: GitHubClient): RouteHandler[] {
  return [
    // GET / — Setup-Seite wenn nicht eingeloggt
    {
      match: (url, method) => url.pathname === '/' && method === 'GET' && !authRepo.getToken(),
      handle: () => html(renderSetupPage()),
    },
    // POST /api/auth — PAT speichern
    {
      match: (url, method) => url.pathname === '/api/auth' && method === 'POST',
      async handle(req) {
        const form = await req.formData()
        const methodOverride = form.get('_method')

        // DELETE via POST (_method override für HTML-Forms)
        if (methodOverride === 'DELETE') {
          authRepo.deleteToken()
          return redirect('/')
        }

        const pat = String(form.get('pat') ?? '').trim()
        if (!pat) return html(renderSetupPage('Bitte Token eingeben'), 400)

        try {
          // PAT temporär setzen um getUser() zu testen
          authRepo.saveToken({ pat, username: '', avatarUrl: '', expiresAt: null })
          const user = await client.getUser()
          authRepo.saveToken({
            pat,
            username: user.login,
            avatarUrl: user.avatarUrl,
            expiresAt: null,
          })
          return redirect('/')
        } catch (e) {
          authRepo.deleteToken()
          const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
          return html(renderSetupPage(msg), 401)
        }
      },
    },
  ]
}
