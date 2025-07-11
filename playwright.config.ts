import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0, // CI環境でのリトライを2回に増やす
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
    actionTimeout: 15000, // アクションタイムアウトを15秒に増加
    navigationTimeout: 45000, // ナビゲーションタイムアウトを45秒に増加
    // ネットワークの不安定性に対する対策
    acceptDownloads: false,
    offline: false,
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
  
  webServer: {
    command: process.env.CI ? 'PORT=3001 npm start' : 'PORT=3001 npm run dev',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 60 * 1000 : 120 * 1000,
  },
})