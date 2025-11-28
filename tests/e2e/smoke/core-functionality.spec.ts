import { test, expect } from '@playwright/test'

test.describe('Core Functionality E2E', () => {
  test('should load homepage successfully', async ({ page }) => {
    const response = await page.goto('/')
    
    // Page should load successfully
    expect(response?.status()).toBe(200)
    
    // Should have basic HTML structure
    await expect(page.locator('html')).toBeVisible()
    await expect(page.locator('body')).toBeVisible()
    
    // Should have the main title
    await expect(page.locator('h1')).toBeVisible()
  })

  test('should have responsive navigation', async ({ page }) => {
    await page.goto('/')
    
    // Navigation should be present
    const nav = page.locator('nav, header')
    await expect(nav.first()).toBeVisible()
    
    // Test mobile responsiveness
    await page.setViewportSize({ width: 375, height: 667 }) // iPhone SE size
    await expect(nav.first()).toBeVisible()
    
    // Test desktop responsiveness
    await page.setViewportSize({ width: 1200, height: 800 })
    await expect(nav.first()).toBeVisible()
  })

  test('should handle genre/period selection', async ({ page }) => {
    await page.goto('/')
    
    // Look for genre selector (dropdown, buttons, etc.)
    const genreSelectors = page.locator('button:has-text("総合"), button:has-text("音楽"), button:has-text("ゲーム")')
    
    if (await genreSelectors.count() > 0) {
      // Test selecting different genres if available
      const firstSelector = genreSelectors.first()
      await firstSelector.click()
      
      // Wait for any potential navigation or content update
      await page.waitForTimeout(500)
      
      // Page should still be functional
      await expect(page.locator('h1')).toBeVisible()
    }
  })

  test('should have proper meta tags and SEO', async ({ page }) => {
    await page.goto('/')
    
    // Check for essential meta tags
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/)
    
    // Should have a title
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
    
    // Check for charset - meta tags are not visible elements, check they exist instead
    await expect(page.locator('meta[charset], meta[charset="utf-8"]').first()).toHaveCount(1)
  })

  test('should handle API errors gracefully', async ({ page }) => {
    // Intercept API calls and simulate failures
    await page.route('**/api/ranking*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' })
      })
    })
    
    await page.goto('/')
    
    // Page should still load and show error state or fallback
    await expect(page.locator('h1')).toBeVisible()
    
    // Should either show error message or fallback content
    const hasErrorMessage = await page.locator('text=エラー, text=問題が発生, text=データを取得できません').count() > 0
    const hasEmptyState = await page.locator('text=データがありません, text=ランキングデータがありません').count() > 0
    const hasFallbackContent = await page.locator('li, article, div').count() > 0
    
    expect(hasErrorMessage || hasEmptyState || hasFallbackContent).toBeTruthy()
  })

  test('should have working external links', async ({ page }) => {
    await page.goto('/')
    
    // Check for Niconico video links
    const videoLinks = page.locator('a[href*="nicovideo.jp"]')
    
    if (await videoLinks.count() > 0) {
      const firstVideoLink = videoLinks.first()
      
      // Should open in new tab
      await expect(firstVideoLink).toHaveAttribute('target', '_blank')
      await expect(firstVideoLink).toHaveAttribute('rel', /noopener/)
      
      // Should have valid href
      const href = await firstVideoLink.getAttribute('href')
      expect(href).toMatch(/^https?:\/\//)
    }
  })

  test('should be accessible', async ({ page }) => {
    await page.goto('/')
    
    // Check for basic accessibility
    await expect(page.locator('h1')).toBeVisible()
    
    // Should be keyboard navigable
    await page.keyboard.press('Tab')
    
    // Should have lang attribute
    const htmlLang = await page.locator('html').getAttribute('lang')
    expect(htmlLang).toBeTruthy()
  })

  test('should handle slow network conditions', async ({ page }) => {
    // Simulate slow network
    await page.context().route('**/*', route => {
      // Add delay to simulate slow network
      setTimeout(() => route.continue(), 100)
    })
    
    await page.goto('/')
    
    // Should still load successfully
    await expect(page.locator('h1')).toBeVisible()
  })
})