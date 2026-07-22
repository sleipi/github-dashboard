import { describe, expect, test } from 'bun:test'
import { buildScopedQuery, buildScopeLabel } from '../../../src/services/search-scope-service.ts'

describe('buildScopedQuery', () => {
  test('appends user and org qualifiers', () => {
    expect(buildScopedQuery('foo', 'alice', ['jtl-software', 'jtl-scx'])).toBe(
      'foo user:alice org:jtl-software org:jtl-scx',
    )
  })

  test('appends only user qualifier when no orgs', () => {
    expect(buildScopedQuery('foo', 'alice', [])).toBe('foo user:alice')
  })

  test('omits user qualifier when username is empty', () => {
    expect(buildScopedQuery('foo', '', ['jtl-software'])).toBe('foo org:jtl-software')
  })

  test('returns q unchanged when username and orgs are both empty', () => {
    expect(buildScopedQuery('foo', '', [])).toBe('foo')
  })
})

describe('buildScopeLabel', () => {
  test('joins username and orgs with slashes', () => {
    expect(buildScopeLabel('alice', ['jtl-software', 'jtl-scx'])).toBe(
      'searching in alice / jtl-software / jtl-scx',
    )
  })

  test('shows only username when there are no orgs', () => {
    expect(buildScopeLabel('alice', [])).toBe('searching in alice')
  })

  test('falls back to a generic label when username is empty and there are no orgs', () => {
    expect(buildScopeLabel('', [])).toBe('searching your repos')
  })
})
