import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // PWA tests should run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for PWA tests
  reporter: process.env.CI ? 'github' : 'html',
  
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // CSPをバイパスしてE2Eテストを正しく動作させる
    bypassCSP: true,
    // HTTPSエラーを無視
    ignoreHTTPSErrors: true,
    // サービスワーカーを許可（PWAテストのため）
    serviceWorkers: 'allow',
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
    // Desktop browsers
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // PWA tests specific settings
        contextOptions: {
          // Allow service workers in context
          serviceWorkers: 'allow',
        }
      },
    },
  ],
  
  // Local dev server config - disabled for PWA tests which need production build
  // webServer is handled by test script
})