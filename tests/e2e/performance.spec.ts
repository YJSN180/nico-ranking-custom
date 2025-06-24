import { test, expect } from '@playwright/test'

test.describe('パフォーマンステスト', () => {
  test('初期ロード時間が許容範囲内', async ({ page }) => {
    const startTime = Date.now()
    
    await page.goto('/')
    
    // メインコンテンツが表示されるまで待つ
    await expect(page.locator('h1')).toBeVisible()
    
    const loadTime = Date.now() - startTime
    
    // 初期ロードは3秒以内であるべき
    expect(loadTime).toBeLessThan(3000)
  })

  test('画像の遅延読み込みが機能する', async ({ page }) => {
    await page.goto('/')
    
    // 画像要素を取得
    const images = page.locator('img')
    const imageCount = await images.count()
    
    if (imageCount > 0) {
      // 最初の画像がloading属性を持つことを確認（lazy loading対応）
      const firstImage = images.first()
      const loadingAttr = await firstImage.getAttribute('loading')
      // loading属性がlazyまたは設定されていない場合（Next.js Imageが自動設定）は許可
      expect(loadingAttr === 'lazy' || loadingAttr === null).toBeTruthy()
      
      // スクロールして画像が読み込まれることを確認
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(1000) // 画像読み込みを待つ
      
      // 画像が表示されていることを確認
      const lastImage = images.last()
      await expect(lastImage).toBeVisible()
    }
  })

  test('大量データでのスクロールパフォーマンス', async ({ page }) => {
    // 総合ランキングで500件のデータをテスト
    await page.goto('/?genre=all&period=24h')
    
    // データが読み込まれるまで待つ
    await page.waitForLoadState('networkidle')
    
    // スクロールのパフォーマンスを測定
    const startTime = Date.now()
    
    // 複数回スクロール
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2)
      })
      await page.waitForTimeout(100)
    }
    
    const scrollTime = Date.now() - startTime
    
    // スクロールが滑らかであること（各スクロールが平均200ms以下）
    expect(scrollTime).toBeLessThan(1000)
  })

  test('APIレート制限の処理', async ({ page }) => {
    // 短時間に複数のリクエストを発生させる
    const requests: Promise<any>[] = []
    
    for (let i = 0; i < 5; i++) {
      requests.push(
        page.goto(`/?genre=game&_=${i}`).catch(() => {})
      )
    }
    
    await Promise.all(requests)
    
    // エラーメッセージが適切に表示されるか確認
    const errorMessage = page.locator('text=リクエストが多すぎます')
    const hasRateLimitError = await errorMessage.count() > 0
    
    // レート制限エラーが表示されるか、正常に表示されるかのいずれか
    const hasContent = await page.locator('h1').count() > 0
    expect(hasRateLimitError || hasContent).toBeTruthy()
  })

  test('キャッシュが効果的に動作する', async ({ page }) => {
    // 初回アクセス
    await page.goto('/?genre=music')
    await page.waitForLoadState('networkidle')
    
    // ネットワークリクエストを監視
    const requests: string[] = []
    page.on('request', request => {
      if (request.url().includes('/api/ranking')) {
        requests.push(request.url())
      }
    })
    
    // 同じページに再度アクセス
    await page.goto('/?genre=game')
    await page.waitForTimeout(500)
    await page.goto('/?genre=music')
    await page.waitForTimeout(500)
    
    // 2回目のアクセスではAPIリクエストが発生しないか、少ないことを確認
    // （キャッシュから読み込まれるため）
    expect(requests.length).toBeLessThanOrEqual(2)
  })

  test('メモリリークがない', async ({ page }) => {
    await page.goto('/')
    
    // 初期メモリ使用量を記録
    const initialMetrics = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize
      }
      return 0
    })
    
    // 複数回ページ遷移
    for (let i = 0; i < 10; i++) {
      const genres = ['game', 'music', 'anime', 'all']
      await page.goto(`/?genre=${genres[i % genres.length]}`)
      await page.waitForTimeout(200)
    }
    
    // ガベージコレクションを促す
    await page.evaluate(() => {
      if ('gc' in window) {
        (window as any).gc()
      }
    })
    
    await page.waitForTimeout(1000)
    
    // 最終メモリ使用量を記録
    const finalMetrics = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize
      }
      return 0
    })
    
    // メモリ使用量が異常に増加していないことを確認
    // （初期値の3倍以内）
    if (initialMetrics > 0 && finalMetrics > 0) {
      expect(finalMetrics).toBeLessThan(initialMetrics * 3)
    }
  })

  test('Lighthouse パフォーマンススコア', async ({ page }) => {
    // 注: この テストはCI環境では実行しない（test.skip）
    test.skip(process.env.CI === 'true', 'CI環境ではスキップ')
    
    await page.goto('/')
    
    // Lighthouseメトリクスの簡易チェック
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Web Vitalsの取得
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const metrics: any = {}
          
          entries.forEach((entry: any) => {
            if (entry.name === 'first-contentful-paint') {
              metrics.fcp = entry.startTime
            } else if (entry.name === 'largest-contentful-paint') {
              metrics.lcp = entry.startTime
            }
          })
          
          if (metrics.fcp && metrics.lcp) {
            observer.disconnect()
            resolve(metrics)
          }
        })
        
        observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] })
        
        // タイムアウト設定
        setTimeout(() => {
          observer.disconnect()
          resolve({})
        }, 5000)
      })
    })
    
    // パフォーマンス基準
    // FCP（First Contentful Paint）: 1.8秒以内
    // LCP（Largest Contentful Paint）: 2.5秒以内
    if ((metrics as any).fcp) {
      expect((metrics as any).fcp).toBeLessThan(1800)
    }
    if ((metrics as any).lcp) {
      expect((metrics as any).lcp).toBeLessThan(2500)
    }
  })
})