import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [
    ['github'],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['html', { open: 'never' }]
  ] : 'html',
  
  // グローバルタイムアウト設定
  timeout: 30000, // 30秒（デフォルト）
  expect: {
    timeout: 10000, // expect のタイムアウト
  },
  
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // アクションタイムアウト（個別操作）
    actionTimeout: 10000,
    // ナビゲーションタイムアウト
    navigationTimeout: 30000,
    // CSPをバイパスしてE2Eテストを正しく動作させる
    bypassCSP: true,
    // HTTPSエラーを無視
    ignoreHTTPSErrors: true,
  },
  
  projects: [
    // Desktop browsers - 高速で安定したChromiumを最優先
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Chromiumは最も安定しているため標準タイムアウト
      },
      testIgnore: '**/mobile.spec.ts',
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        // Firefoxは中程度の安定性
      },
      testIgnore: '**/mobile.spec.ts',
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        // WebKitは最も不安定なためタイムアウトを延長
        actionTimeout: 15000,
        navigationTimeout: 45000,
      },
      testIgnore: '**/mobile.spec.ts',
      // WebKit専用のタイムアウト設定
      timeout: 45000,
    },
    // Mobile browsers - WebKit only
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
        hasTouch: true,
        // モバイルでもタイムアウトを延長
        actionTimeout: 15000,
        navigationTimeout: 45000,
      },
      testMatch: '**/mobile.spec.ts',
      timeout: 45000,
    },
  ],
  
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
})