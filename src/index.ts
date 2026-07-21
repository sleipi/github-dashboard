import { homedir } from 'node:os'
import { join } from 'node:path'
import { createSqliteRepos } from './db/sqlite-repository.ts'
import { createGitHubClient } from './github/github-client.ts'
import { createActivityRoutes } from './routes/activity-route.ts'
import { createAuthRoutes } from './routes/auth-route.ts'
import { createCardRoutes } from './routes/card-route.ts'
import { createModalRoutes } from './routes/modal-route.ts'
import { createPrRoutes } from './routes/pr-route.ts'
import { redirect } from './routes/route-handler.ts'
import type { RouteHandler } from './routes/route-handler.ts'
import { createSecurityRoutes } from './routes/security-route.ts'
import { startServer } from './server.ts'
import { createActivityService } from './services/activity-service.ts'
import { createCardService } from './services/card-service.ts'

const DB_PATH = process.env.GH_DASH_DB ?? join(homedir(), '.github-dashboard.db')
const PORT = Number(process.env.PORT ?? 4242)

const repos = createSqliteRepos(DB_PATH)
const client = createGitHubClient(repos.auth)
const cardService = createCardService(repos, client)
const activityService = createActivityService(repos, client)

const routes: RouteHandler[] = [
  ...createAuthRoutes(repos.auth, client),
  ...createCardRoutes(cardService, activityService, repos.auth, client),
  ...createActivityRoutes(activityService, repos.auth),
  ...createModalRoutes(cardService, repos.cards, client, repos.auth),
  ...createSecurityRoutes(repos.security, repos.sla),
  ...createPrRoutes(repos.pullRequests),
]

if (process.env.PLAYWRIGHT_TEST === '1') {
  routes.push({
    match: (url, method) => url.pathname === '/api/test/restore-session' && method === 'POST',
    handle() {
      repos.auth.saveToken({
        pat: 'ghp_testtoken000000000000000000000000',
        username: 'testuser',
        avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
        expiresAt: null,
      })
      repos.cards.pin('alice/awesome-project')
      repos.cards.pin('alice/another-repo')
      repos.cards.reorder(['alice/awesome-project', 'alice/another-repo'])
      repos.autoSort.setEnabled(false)
      repos.globalSearch.setEnabled(false)
      for (const fullName of ['alice/awesome-project', 'alice/another-repo']) {
        const c = repos.pullRequests.getCache(fullName)
        if (c)
          repos.pullRequests.upsertCache(fullName, {
            lastCommitAt: c.lastCommitAt,
            prTotal: c.prTotal,
            dependabotCount: c.dependabotCount,
          })
        // Seed fresh activity_meta so E2E tests never hit GitHub Events API
        repos.activity.upsertMeta(fullName, {
          eventsEtag: '"test-etag"',
          eventsCachedAt: new Date(),
          pollIntervalSecs: 60,
          dependabotCachedAt: new Date(),
          prsCachedAt: new Date(),
        })
      }
      return redirect('/')
    },
  })
  routes.push({
    match: (url, method) => url.pathname === '/api/test/set-expiry' && method === 'POST',
    async handle(req) {
      const body = (await req.json()) as { daysFromNow: number }
      const token = repos.auth.getToken()
      if (!token) return new Response('no token', { status: 400 })
      const expiresAt = new Date(Date.now() + body.daysFromNow * 86_400_000)
      repos.auth.saveToken({ ...token, expiresAt })
      return new Response('ok')
    },
  })
}

startServer(PORT, routes)
