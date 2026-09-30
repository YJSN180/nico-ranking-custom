import { defineConfig, devices } from '@playwright/test'

// Public, read-only probes: never start the development server or reuse a local session.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'monitoring.spec.ts',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://nico-rank.com',
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  // Match the browsers enabled by the existing project config (WebKit is excluded).
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
})
