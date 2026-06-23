export interface RouteHandler {
  match(url: URL, method: string): boolean
  handle(req: Request, url: URL): Promise<Response> | Response
}

export function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } })
}

export function htmxTrigger(body: string, event: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'HX-Trigger': event,
    },
  })
}

export function htmlWithTrigger(body: string, trigger: Record<string, unknown>): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'HX-Trigger': JSON.stringify(trigger),
    },
  })
}
