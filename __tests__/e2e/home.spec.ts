import { test, expect } from '@playwright/test'

test.describe('Home Page E2E', () => {
  test('should display ranking with correct structure', async ({ page }) => {
    await page.goto('/')
    
    await expect(page.locator('h1')).toContainText('ニコニコ24時間総合ランキング')
    
    const firstRankItem = page.locator('li').first()
    await expect(firstRankItem).toBeVisible()
    
    const firstRankText = await firstRankItem.locator('div').first().textContent()
    expect(firstRankText).toMatch(/1位/)
    
    const firstLink = firstRankItem.locator('a')
    await expect(firstLink).toHaveAttribute('target', '_blank')
    await expect(firstLink).toHaveAttribute('rel', 'noopener noreferrer')
    
    const href = await firstLink.getAttribute('href')
    expect(href).toMatch(/^https:\/\/www\.nicovideo\.jp\/watch\/sm\d+$/)
  })

  test('should display at least one video with sm ID', async ({ page }) => {
    await page.goto('/')
    
    const links = await page.locator('a[href*="nicovideo.jp/watch/sm"]').all()
    expect(links.length).toBeGreaterThan(0)
    
    const firstVideoLink = links[0]
    if (firstVideoLink) {
      const href = await firstVideoLink.getAttribute('href')
      expect(href).toContain('sm')
    }
  })

  test('should display view counts', async ({ page }) => {
    await page.goto('/')
    
    // View counts should be present (even if 0)
    const viewCountElements = await page.locator('text=/\\d+[,\\d]* 回再生/').all()
    expect(viewCountElements.length).toBeGreaterThan(0)
    
    // Check that at least one element has the expected format
    const firstViewCount = await viewCountElements[0]?.textContent()
    expect(firstViewCount).toMatch(/^\d{1,3}(,\d{3})* 回再生$/)
  })
})