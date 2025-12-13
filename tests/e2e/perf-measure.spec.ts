import { test, expect } from '@playwright/test'

// 計測用サンプルデータ
const mockRanking = {
  items: Array.from({ length: 50 }).map((_, i) => ({
    id: `id-${i}`,
    rank: i + 1,
    title: `title-${i}`,
    authorName: `author-${i}`,
    tags: [],
    tagDetails: [],
  })),
  popularTags: ['tag-a', 'tag-b']
}

// /api/ranking をモックし、UI計測のみ行う
async function setupApiMock(page) {
  await page.route('**/api/ranking**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockRanking),
    })
  })
}

// このテストはAPIモックを使用しているが、Next.jsのSSRがサーバー側でAPIを
// 呼び出すため、クライアント側のモックだけでは不十分。
// CI環境ではSSRがAPIに接続できずタイムアウトするため、スキップする。
// 本番環境でのパフォーマンス監視は e2e-monitoring.yml で別途実施。
test.skip('perf: landing + genre change timeline (requires live API)', async ({ page }) => {
  // APIモックを設定（ページ遷移前に設定する必要がある）
  await setupApiMock(page)

  // ページ遷移とレスポンス待機を同時に開始
  const start = performance.now()
  const [firstResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/ranking'), { timeout: 30000 }),
    page.goto('/')
  ])
  const responseTime = performance.now() - start

  // ジャンル切替（例: その他）
  // CI環境のパフォーマンスを考慮して長めのタイムアウトを設定
  const t1 = performance.now()
  const otherButton = page.getByRole('button', { name: 'その他' })
  await otherButton.waitFor({ state: 'visible', timeout: 15000 })

  // クリックとレスポンス待機を同時に開始
  const [res2] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/ranking'), { timeout: 30000 }),
    otherButton.click()
  ])
  const responseTime2 = performance.now() - t1

  // パフォーマンスメトリクスの取得
  const perf = await page.evaluate(() => {
    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    if (entries.length > 0) {
      const nav = entries[0]
      return {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        load: Math.round(nav.loadEventEnd - nav.startTime),
      }
    }
    // フォールバック（古いAPI）
    const { timing } = performance as any
    return {
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
      load: timing.loadEventEnd - timing.navigationStart,
    }
  })

  console.log(JSON.stringify({
    responseTimeMs: Math.round(responseTime),
    responseTimeGenreChangeMs: Math.round(responseTime2),
    domContentLoadedMs: perf.domContentLoaded,
    loadMs: perf.load,
    firstResponseStatus: firstResponse.status(),
    secondResponseStatus: res2.status(),
  }))

  expect(firstResponse.ok()).toBeTruthy()
  expect(res2.ok()).toBeTruthy()
})
