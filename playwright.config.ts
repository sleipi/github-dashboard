import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:4242',
  },
  webServer: {
    command: 'bun run src/index.ts',
    url: 'http://localhost:4242',
    reuseExistingServer: true,
  },
})
