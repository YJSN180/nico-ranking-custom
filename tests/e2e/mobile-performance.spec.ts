import { test, expect, devices } from '@playwright/test'

test.use({
  ...devices['iPhone 12'],
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
})

test.describe('モバイル版パフォーマンステスト', () => {

  test('モバイル版でのレイアウトシフトとフォント読み込み遅延', async ({ page }) => {
    // パフォーマンス測定の準備
    const metrics: any = {
      navigationStart: 0,
      fontLoadStart: 0,
      fontLoadEnd: 0,
      firstPaint: 0,
      firstContentfulPaint: 0,
      largestContentfulPaint: 0,
      layoutShifts: [],
      mobileDetectionTime: 0,
      rerenderCount: 0
    }

    // コンソールログを監視
    const consoleLogs: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'log') {
        consoleLogs.push(msg.text())
      }
    })

    // レイアウトシフトを監視
    await page.evaluateOnNewDocument(() => {
      window.__layoutShifts = []
      if ('LayoutShift' in window) {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              window.__layoutShifts.push({
                value: (entry as any).value,
                time: entry.startTime
              })
            }
          }
        }).observe({ type: 'layout-shift', buffered: true })
      }
    })

    // フォント読み込みを監視
    await page.evaluateOnNewDocument(() => {
      window.__fontLoadMetrics = {
        start: 0,
        nicomojiLoaded: 0,
        comicSansLoaded: 0,
        allLoaded: 0
      }
      
      if ('fonts' in document) {
        window.__fontLoadMetrics.start = performance.now()
        
        document.fonts.ready.then(() => {
          window.__fontLoadMetrics.allLoaded = performance.now()
        })
        
        // 個別フォントの監視
        document.fonts.load('normal 1em "Nicomoji Plus v2"').then(() => {
          window.__fontLoadMetrics.nicomojiLoaded = performance.now()
        })
        
        document.fonts.load('bold 1em "Comic Sans MS Bold"').then(() => {
          window.__fontLoadMetrics.comicSansLoaded = performance.now()
        })
      }
    })

    // React再レンダリングを監視（簡易版）
    await page.evaluateOnNewDocument(() => {
      window.__rerenderCount = 0
      const originalCreateElement = (window as any).React?.createElement
      if (originalCreateElement) {
        (window as any).React.createElement = function(...args: any[]) {
          window.__rerenderCount++
          return originalCreateElement.apply(this, args)
        }
      }
    })

    // ナビゲーション開始
    const startTime = Date.now()
    await page.goto('http://localhost:3000')
    
    // ページロード完了まで待機
    await page.waitForLoadState('networkidle')
    
    // メトリクスを収集
    const pageMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as any
      const paints = performance.getEntriesByType('paint')
      
      return {
        navigationTiming: {
          domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
          loadComplete: nav.loadEventEnd - nav.loadEventStart,
          domInteractive: nav.domInteractive,
          responseEnd: nav.responseEnd
        },
        paints: paints.map(p => ({ name: p.name, time: p.startTime })),
        layoutShifts: (window as any).__layoutShifts || [],
        fontMetrics: (window as any).__fontLoadMetrics || {},
        rerenderCount: (window as any).__rerenderCount || 0,
        screenWidth: window.innerWidth,
        devicePixelRatio: window.devicePixelRatio
      }
    })

    // useMobileDetectの動作を確認
    const mobileDetectTime = await page.evaluate(() => {
      const start = performance.now()
      const checkMobile = () => window.innerWidth <= 640
      const isMobile = checkMobile()
      return {
        time: performance.now() - start,
        isMobile,
        width: window.innerWidth
      }
    })

    // レポート出力
    console.log('\n=== モバイル版パフォーマンス測定結果 ===')
    console.log(`画面幅: ${pageMetrics.screenWidth}px (DPR: ${pageMetrics.devicePixelRatio})`)
    console.log(`モバイル判定: ${mobileDetectTime.isMobile} (判定時間: ${mobileDetectTime.time.toFixed(2)}ms)`)
    
    console.log('\n--- ペイントタイミング ---')
    pageMetrics.paints.forEach(p => {
      console.log(`${p.name}: ${p.time.toFixed(2)}ms`)
    })
    
    console.log('\n--- フォント読み込み ---')
    if (pageMetrics.fontMetrics.start) {
      const fontLoadTime = pageMetrics.fontMetrics.allLoaded - pageMetrics.fontMetrics.start
      console.log(`全フォント読み込み時間: ${fontLoadTime.toFixed(2)}ms`)
      console.log(`Nicomoji Plus v2: ${(pageMetrics.fontMetrics.nicomojiLoaded - pageMetrics.fontMetrics.start).toFixed(2)}ms`)
      console.log(`Comic Sans MS Bold: ${(pageMetrics.fontMetrics.comicSansLoaded - pageMetrics.fontMetrics.start).toFixed(2)}ms`)
    }
    
    console.log('\n--- レイアウトシフト ---')
    const totalCLS = pageMetrics.layoutShifts.reduce((sum: number, shift: any) => sum + shift.value, 0)
    console.log(`累積レイアウトシフト (CLS): ${totalCLS.toFixed(4)}`)
    console.log(`レイアウトシフト回数: ${pageMetrics.layoutShifts.length}`)
    
    if (pageMetrics.layoutShifts.length > 0) {
      console.log('シフト詳細:')
      pageMetrics.layoutShifts.forEach((shift: any, i: number) => {
        console.log(`  ${i + 1}. 値: ${shift.value.toFixed(4)}, 時間: ${shift.time.toFixed(2)}ms`)
      })
    }
    
    console.log('\n--- その他 ---')
    console.log(`DOM Content Loaded: ${pageMetrics.navigationTiming.domContentLoaded.toFixed(2)}ms`)
    console.log(`Load Complete: ${pageMetrics.navigationTiming.loadComplete.toFixed(2)}ms`)
    console.log(`総ページロード時間: ${Date.now() - startTime}ms`)
    
    // アサーション
    const fcp = pageMetrics.paints.find(p => p.name === 'first-contentful-paint')
    expect(fcp).toBeDefined()
    expect(fcp!.time).toBeLessThan(3000) // FCPは3秒以内
    
    expect(totalCLS).toBeLessThan(0.25) // CLSは0.25以下（"Poor"の閾値）
    
    // フォント読み込みは5秒以内
    if (pageMetrics.fontMetrics.allLoaded) {
      const fontLoadTime = pageMetrics.fontMetrics.allLoaded - pageMetrics.fontMetrics.start
      expect(fontLoadTime).toBeLessThan(5000)
    }
  })

  test('SSR/CSRハイドレーションミスマッチの検証', async ({ page }) => {
    let hydrationErrors: string[] = []
    
    // React hydrationエラーを監視
    page.on('console', msg => {
      const text = msg.text()
      if (text.includes('Warning: ') && 
          (text.includes('did not match') || 
           text.includes('Hydration') ||
           text.includes('suppressHydrationWarning'))) {
        hydrationErrors.push(text)
      }
    })
    
    // エラーも監視
    page.on('pageerror', error => {
      if (error.message.includes('hydrat')) {
        hydrationErrors.push(`ERROR: ${error.message}`)
      }
    })
    
    await page.goto('http://localhost:3000')
    await page.waitForLoadState('networkidle')
    
    // ハイドレーション後の要素を確認
    const headerPadding = await page.evaluate(() => {
      const header = document.querySelector('.header-container') as HTMLElement
      return header ? window.getComputedStyle(header).padding : null
    })
    
    const titleFontSize = await page.evaluate(() => {
      const title = document.querySelector('h1') as HTMLElement
      return title ? window.getComputedStyle(title).fontSize : null
    })
    
    console.log('\n=== SSR/CSRミスマッチ検証 ===')
    console.log(`ハイドレーションエラー数: ${hydrationErrors.length}`)
    if (hydrationErrors.length > 0) {
      console.log('エラー詳細:')
      hydrationErrors.forEach(err => console.log(`  - ${err}`))
    }
    console.log(`ヘッダーパディング: ${headerPadding}`)
    console.log(`タイトルフォントサイズ: ${titleFontSize}`)
    
    // モバイルでは特定の値になっているはず
    expect(headerPadding).toBe('5px 12px')
    expect(titleFontSize).toBe('22px')
    
    // ハイドレーションエラーがないことを確認
    expect(hydrationErrors.length).toBe(0)
  })
})