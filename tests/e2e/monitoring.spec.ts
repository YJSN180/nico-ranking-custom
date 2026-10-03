import { test, expect } from '@playwright/test'
import { injectAxe, checkA11y } from 'axe-playwright'

test.beforeEach(async ({ page }) => {
  // Do not submit telemetry or mutate production while probing the public UI.
  await page.route('**/*', route => {
    if (!['GET', 'HEAD'].includes(route.request().method())) return route.abort()
    return route.continue()
  })
})

for (const genre of ['all', 'other']) {
  test(`@smoke ${genre}: ranking cards are visible`, async ({ page }) => {
    const response = await page.goto(`/?genre=${genre}&period=24h`)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('button', { name: 'メニュー', exact: true })).toBeVisible()
    // An error/empty-state message must never count as a healthy ranking.
    await expect(page.getByTestId('ranking-item').first()).toBeVisible()
    await expect(page.getByTestId('ranking-item').first().locator('a[href*="nicovideo.jp/watch/"]').first()).toBeVisible()
  })
}

test('@performance first ranking card appears within 15 seconds', async ({ page }) => {
  const started = Date.now()
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('ranking-item').first()).toBeVisible()
  expect(Date.now() - started).toBeLessThan(15_000)
})

test('@accessibility homepage has no serious or critical axe violations', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('ranking-item').first()).toBeVisible()
  await injectAxe(page)
  // Do not catch assertion failures and turn them into a passing fallback.
  await checkA11y(page, undefined, { includedImpacts: ['serious', 'critical'] })
})
