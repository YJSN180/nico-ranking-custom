import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // CSPをバイパスしてE2Eテストを正しく動作させる
    bypassCSP: true,
    // HTTPSエラーを無視
    ignoreHTTPSErrors: true,
    // サービスワーカーをブロック（APIモックのため）
    serviceWorkers: 'block',
    // タイムアウト設定を調整
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  
  // グローバルタイムアウト設定
  timeout: 60000, // 各テストのタイムアウトを60秒に設定
  expect: {
    timeout: 10000, // expect のタイムアウトを10秒に設定
  },
  
  projects: [
    // Safari only
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  
  webServer: {
    command: 'npm run dev -- --port 3001',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})