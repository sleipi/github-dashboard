export const GLOBAL_SCOPE_LABEL = 'searching all of GitHub'

export function buildScopedQuery(q: string, username: string, orgs: readonly string[]): string {
  const qualifiers: string[] = []
  if (username) qualifiers.push(`user:${username}`)
  for (const org of orgs) qualifiers.push(`org:${org}`)
  return qualifiers.length > 0 ? `${q} ${qualifiers.join(' ')}` : q
}

export function buildScopeLabel(username: string, orgs: readonly string[]): string {
  const scopes = [username, ...orgs].filter((s) => s.length > 0)
  return scopes.length > 0 ? `searching in ${scopes.join(' / ')}` : 'searching your repos'
}
