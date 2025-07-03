import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'blob' : 'html',
  
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
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/mobile.spec.ts', // モバイルテストを除外
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: '**/mobile.spec.ts', // モバイルテストを除外
    },
    // WebKit除外 (ユーザー指示により失敗が予想されるため)
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    //   testIgnore: '**/mobile.spec.ts', // モバイルテストを除外
    // },
    // Mobile browsers - WebKit除外
    // {
    //   name: 'mobile-safari',
    //   use: { 
    //     ...devices['iPhone 12'],
    //     hasTouch: true, // タッチスクリーンを有効化
    //   },
    //   testMatch: '**/mobile.spec.ts', // モバイルテストのみ実行
    // },
  ],
  
  webServer: process.env.CI ? undefined : {
    command: 'PORT=3001 npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
})