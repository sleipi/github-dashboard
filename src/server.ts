import type { RouteHandler } from './routes/route-handler.ts'

export function startServer(port: number, routes: RouteHandler[]): void {
  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)
      for (const route of routes) {
        if (route.match(url, req.method)) {
          return route.handle(req, url)
        }
      }
      return new Response('Not found', { status: 404 })
    },
  })
  console.log(`GitHub Dashboard running at http://localhost:${port}`)
}
