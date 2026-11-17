// src/templates/rate-limit-template.ts
export type RateLimitViewModel = {
  readonly label: string
  readonly title: string
  readonly color: string
}

export function renderRateLimit(vm: RateLimitViewModel): string {
  return `<span id="rate-limit"
        hx-get="/api/rate-limit" hx-trigger="every 10s [!document.hidden], cardsChanged from:body" hx-swap="outerHTML"
        title="${vm.title}"
        style="font-size:11px;color:${vm.color};font-variant-numeric:tabular-nums">${vm.label}</span>`
}
