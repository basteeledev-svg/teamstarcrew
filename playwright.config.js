import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,       // 3 min — reactor overheat test needs ~60 seconds
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1280, height: 800 },
  },
  // Run tests serially so state builds on prior tests
  workers: 1,
})
