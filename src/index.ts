import { homedir } from 'node:os'
import { join } from 'node:path'
import { createSqliteRepos } from './db/sqlite-repository.ts'
import { createGitHubClient } from './github/github-client.ts'
import { createAuthRoutes } from './routes/auth-route.ts'
import { createCardRoutes } from './routes/card-route.ts'
import { createModalRoutes } from './routes/modal-route.ts'
import { createPrRoutes } from './routes/pr-route.ts'
import { redirect } from './routes/route-handler.ts'
import type { RouteHandler } from './routes/route-handler.ts'
import { startServer } from './server.ts'
import { createCardService } from './services/card-service.ts'

const DB_PATH = process.env.GH_DASH_DB ?? join(homedir(), '.github-dashboard.db')
const PORT = Number(process.env.PORT ?? 4242)

const repos = createSqliteRepos(DB_PATH)
const client = createGitHubClient(repos.auth)
const cardService = createCardService(repos, client)

const routes: RouteHandler[] = [
  ...createAuthRoutes(repos.auth, client),
  ...createCardRoutes(cardService, repos.auth),
  ...createModalRoutes(cardService, repos.cards),
  ...createPrRoutes(repos.pullRequests),
]

// Test-only routes: full DB state reset (only available when PLAYWRIGHT_TEST=1)
if (process.env.PLAYWRIGHT_TEST === '1') {
  routes.push({
    match: (url, method) => url.pathname === '/api/test/restore-session' && method === 'POST',
    handle() {
      repos.auth.saveToken({
        pat: 'ghp_testtoken000000000000000000000000',
        username: 'testuser',
        avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
      })
      // Re-pin repos (INSERT OR IGNORE is idempotent) and restore canonical order
      repos.cards.pin('alice/awesome-project')
      repos.cards.pin('alice/another-repo')
      repos.cards.reorder(['alice/awesome-project', 'alice/another-repo'])
      // Refresh cachedAt so getCard() serves from DB (not GitHub) during tests
      for (const fullName of ['alice/awesome-project', 'alice/another-repo']) {
        const c = repos.pullRequests.getCache(fullName)
        if (c) {
          repos.pullRequests.upsertCache(fullName, {
            lastCommitAt: c.lastCommitAt,
            prTotal: c.prTotal,
            dependabotCount: c.dependabotCount,
          })
        }
      }
      return redirect('/')
    },
  })
}

startServer(PORT, routes)
