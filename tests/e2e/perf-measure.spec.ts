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

test.skip('perf: landing + genre change timeline (CI skip)', async ({ page }) => {
  await setupApiMock(page)

  const start = performance.now()
  const resPromise = page.waitForResponse((r) => r.url().includes('/api/ranking'))
  await page.goto('/')
  const firstResponse = await resPromise
  const responseTime = performance.now() - start

  // ジャンル切替（例: other）
  const t1 = performance.now()
  await page.waitForSelector('button:has-text("その他")', { timeout: 10000 })
  await page.click('button:has-text("その他")')
  const res2 = await page.waitForResponse((r) => r.url().includes('/api/ranking'))
  const responseTime2 = performance.now() - t1

  // FCP/Load の取得
  const perf = await page.evaluate(() => {
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

  await expect(firstResponse.ok()).toBeTruthy()
  await expect(res2.ok()).toBeTruthy()
})
