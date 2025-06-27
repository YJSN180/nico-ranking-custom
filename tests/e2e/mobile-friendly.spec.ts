import { test, expect } from '@playwright/test'

test.describe('モバイルフレンドリーテスト', () => {
  test('横スクロールが発生しない', async ({ page }) => {
    // iPhone 14 Pro Maxのビューポートサイズに設定（GitHub Actionsと同じ）
    await page.setViewportSize({ width: 393, height: 852 })
    
    await page.goto('/', { waitUntil: 'networkidle' })
    
    // ページが完全に読み込まれるまで待つ
    await page.waitForTimeout(2000)
    
    // デバッグ情報を出力
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    
    console.log(`Document width: ${documentWidth}px`)
    console.log(`Viewport width: ${viewportWidth}px`)
    
    // 横スクロールが発生していないことを確認
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth
    })
    
    if (hasHorizontalScroll) {
      // どの要素が横幅を超えているか特定
      const overflowingElements = await page.evaluate(() => {
        const elements = []
        const allElements = document.querySelectorAll('*')
        const viewportWidth = window.innerWidth
        
        allElements.forEach(el => {
          const rect = el.getBoundingClientRect()
          if (rect.width > viewportWidth || rect.right > viewportWidth) {
            elements.push({
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              width: rect.width,
              right: rect.right,
              styles: {
                width: window.getComputedStyle(el).width,
                maxWidth: window.getComputedStyle(el).maxWidth,
                padding: window.getComputedStyle(el).padding,
                margin: window.getComputedStyle(el).margin,
                overflow: window.getComputedStyle(el).overflow
              }
            })
          }
        })
        
        return elements
      })
      
      console.log('Overflowing elements:', JSON.stringify(overflowingElements, null, 2))
    }
    
    expect(hasHorizontalScroll).toBe(false)
  })
  
  test('モバイルビューでコンテンツが正しく表示される', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/', { waitUntil: 'networkidle' })
    
    // コンテナの幅が適切に制限されているか確認
    const containers = await page.evaluate(() => {
      const results = []
      const containerSelectors = ['.container', 'main', 'body > div', '[class*="wrapper"]']
      
      containerSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector)
        elements.forEach(el => {
          const rect = el.getBoundingClientRect()
          const styles = window.getComputedStyle(el)
          results.push({
            selector,
            width: rect.width,
            maxWidth: styles.maxWidth,
            padding: styles.padding,
            margin: styles.margin,
            boxSizing: styles.boxSizing
          })
        })
      })
      
      return results
    })
    
    console.log('Container widths:', JSON.stringify(containers, null, 2))
    
    // 全てのコンテナがビューポート幅を超えていないことを確認
    for (const container of containers) {
      expect(container.width).toBeLessThanOrEqual(393)
    }
  })
  
  test('モバイルでCSS Container Queriesが適用される', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/', { waitUntil: 'networkidle' })
    
    // Container Query対応要素の確認
    const containerQueryStyles = await page.evaluate(() => {
      const results = []
      const elements = document.querySelectorAll('[style*="container-type"], .ranking-item-responsive__content')
      
      elements.forEach(el => {
        const styles = window.getComputedStyle(el)
        results.push({
          className: el.className,
          containerType: styles.containerType || 'none',
          width: el.getBoundingClientRect().width,
          display: styles.display,
          gridTemplateColumns: styles.gridTemplateColumns
        })
      })
      
      return results
    })
    
    console.log('Container Query styles:', JSON.stringify(containerQueryStyles, null, 2))
  })
})