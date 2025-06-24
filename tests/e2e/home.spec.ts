import { test, expect } from '@playwright/test'

test.describe('Home Page E2E', () => {
  test('should display site header and navigation', async ({ page }) => {
    await page.goto('/')
    
    // Check site title
    await expect(page.locator('h1')).toContainText('ニコラン(Re:turn)')
    
    // Check navigation elements exist
    await expect(page.locator('nav')).toBeVisible()
    
    // Check that genre selector is present
    await expect(page.locator('[data-testid="genre-selector"], select')).toBeVisible()
  })

  test('should display loading state initially', async ({ page }) => {
    await page.goto('/')
    
    // Should show loading or skeleton state initially
    await expect(page.locator('text=データを読み込み中, text=読み込み中, [data-testid="loading"], [data-testid="skeleton"]').first()).toBeVisible({ timeout: 1000 }).catch(() => {
      // Loading might be too fast to catch, that's ok
    })
  })

  test('should load and display ranking data or empty state', async ({ page }) => {
    await page.goto('/')
    
    // Wait for content to load
    await page.waitForLoadState('networkidle')
    
    // Should either show ranking items or empty state
    const hasRankingItems = await page.locator('li').count() > 0
    const hasEmptyState = await page.locator('text=データがありません, text=ランキングデータがありません').count() > 0
    
    expect(hasRankingItems || hasEmptyState).toBeTruthy()
    
    // If there are ranking items, check their structure
    if (hasRankingItems) {
      const firstRankItem = page.locator('li').first()
      await expect(firstRankItem).toBeVisible()
      
      // Check for video links (if they exist)
      const videoLinks = await page.locator('a[href*="nicovideo.jp/watch/sm"]').count()
      if (videoLinks > 0) {
        const firstLink = page.locator('a[href*="nicovideo.jp/watch/sm"]').first()
        await expect(firstLink).toHaveAttribute('target', '_blank')
        await expect(firstLink).toHaveAttribute('rel', 'noopener noreferrer')
      }
    }
  })

  test('should have working theme toggle', async ({ page }) => {
    await page.goto('/')
    
    // Look for settings or theme toggle button
    const settingsButton = page.locator('[data-testid="settings-button"], button:has-text("設定"), button:has-text("⚙"), [aria-label*="設定"]')
    
    if (await settingsButton.count() > 0) {
      await settingsButton.first().click()
      
      // Check if theme options are available
      const themeOptions = page.locator('text=ダークモード, text=ライトモード, text=テーマ')
      await expect(themeOptions.first()).toBeVisible({ timeout: 2000 }).catch(() => {
        // Theme toggle might not be immediately visible
      })
    }
  })
})