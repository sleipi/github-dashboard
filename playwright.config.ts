import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

export const TEST_DB_DIR = mkdtempSync(join(tmpdir(), 'gh-dash-e2e-'))
export const TEST_DB_PATH = join(TEST_DB_DIR, 'test.db')

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4242',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `bun run tests/e2e/seed-db.ts ${TEST_DB_PATH} && GH_DASH_DB=${TEST_DB_PATH} PLAYWRIGHT_TEST=1 bun run src/index.ts`,
    url: 'http://localhost:4242',
    reuseExistingServer: false,
    env: { GH_DASH_DB: TEST_DB_PATH, PLAYWRIGHT_TEST: '1' },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
