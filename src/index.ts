import { homedir } from 'node:os'
import { join } from 'node:path'
import { createSqliteRepos } from './db/sqlite-repository.ts'
import { createGitHubClient } from './github/github-client.ts'
import { createAuthRoutes } from './routes/auth-route.ts'
import { createCardRoutes } from './routes/card-route.ts'
import { createModalRoutes } from './routes/modal-route.ts'
import { createPrRoutes } from './routes/pr-route.ts'
import { startServer } from './server.ts'
import { createCardService } from './services/card-service.ts'

const DB_PATH = process.env.GH_DASH_DB ?? join(homedir(), '.github-dashboard.db')
const PORT = Number(process.env.PORT ?? 4242)

const repos = createSqliteRepos(DB_PATH)
const client = createGitHubClient(repos.auth)
const cardService = createCardService(repos, client)

const routes = [
  ...createAuthRoutes(repos.auth, client),
  ...createCardRoutes(cardService, repos.auth),
  ...createModalRoutes(cardService, repos.cards),
  ...createPrRoutes(repos.pullRequests),
]

startServer(PORT, routes)
