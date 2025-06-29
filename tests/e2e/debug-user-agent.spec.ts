// このE2Eテストは削除されました。
// 理由：WebKit/SafariのユーザーエージェントのデバッグとSafari検出ロジックのテスト
// - デバッグ用のテストであり、正式なテストスイートには不要
// - 単体テストまたは他のE2Eテストでカバー済み

/*
import { test, expect } from '@playwright/test'
import { 
  mockAPIRoutes, 
  setupIndexedDBMock, 
  waitForPageReady,
} from './helpers/test-helpers'

test.describe('Debug User Agent in webkit', () => {
  test('should log webkit user agent string on root page', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'webkit only')
    
    await page.goto('/')
    
    const userAgent = await page.evaluate(() => navigator.userAgent)
    console.log('Webkit User-Agent:', userAgent)
    
    const isSafariResult = await page.evaluate(() => {
      const ua = navigator.userAgent.toLowerCase()
      const isSafariBrowser = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android')
      const isIOSSafari = /iphone|ipad|ipod/.test(ua) && /webkit/.test(ua) && !ua.includes('crios')
      
      return {
        userAgent: ua,
        isSafariBrowser,
        isIOSSafari,
        result: isSafariBrowser || isIOSSafari,
        hasWebkit: ua.includes('webkit'),
        hasVersion: ua.includes('version/'),
        hasChrome: ua.includes('chrome')
      }
    })
    
    console.log('Safari detection result:', isSafariResult)
    
    // Log what components are actually visible on root page
    const componentsVisible = await page.evaluate(() => {
      return {
        safariWarning: !!document.querySelector('[data-testid="safari-persistence-warning"]'),
        exportButton: !!document.querySelector('[data-testid="export-mylists-button"]'),
        importButton: !!document.querySelector('[data-testid="import-mylists-button"]')
      }
    })
    
    console.log('Components visible on root page:', componentsVisible)
    
    expect(userAgent).toBeDefined()
  })

  test('should log webkit user agent string on mylists page', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'webkit only')
    
    // Set up test helpers to simulate failing test environment
    await mockAPIRoutes(page)
    await setupIndexedDBMock(page)
    
    await page.goto('/mylists')
    // Skip waitForPageReady to avoid waiting for safari components
    await page.waitForLoadState('networkidle')
    
    // Force test initialization completion
    await page.evaluate(() => {
      const event = new CustomEvent('test-force-init-complete');
      window.dispatchEvent(event);
    });
    
    // Wait for the main container to appear
    try {
      await page.waitForSelector('.container', { timeout: 10000 });
    } catch (e) {
      console.log('Container not found, proceeding anyway');
    }
    
    await page.waitForTimeout(1000)
    
    const userAgent = await page.evaluate(() => navigator.userAgent)
    console.log('Webkit User-Agent on mylists:', userAgent)
    
    const isSafariResult = await page.evaluate(() => {
      const ua = navigator.userAgent.toLowerCase()
      const isSafariBrowser = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android')
      const isIOSSafari = /iphone|ipad|ipod/.test(ua) && /webkit/.test(ua) && !ua.includes('crios')
      
      return {
        userAgent: ua,
        isSafariBrowser,
        isIOSSafari,
        result: isSafariBrowser || isIOSSafari,
        hasWebkit: ua.includes('webkit'),
        hasVersion: ua.includes('version/'),
        hasChrome: ua.includes('chrome')
      }
    })
    
    console.log('Safari detection result on mylists:', isSafariResult)
    
    // Test the actual isSafari function from our module
    const moduleTestResult = await page.evaluate(() => {
      // Import the function directly in the browser context
      const testIsSafari = () => {
        if (typeof window === 'undefined') return false
        
        const ua = navigator.userAgent.toLowerCase()
        const isSafariBrowser = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android')
        
        // iOS Safari の検出
        const isIOSSafari = /iphone|ipad|ipod/.test(ua) && /webkit/.test(ua) && !ua.includes('crios')
        
        // Playwright WebKit の検出（E2Eテスト環境用）
        // Playwright WebKitは実際のSafariブラウザエンジンを使用しているため、Safari特有の問題も再現される
        const isPlaywrightWebkit = ua.includes('webkit') && ua.includes('version/') && !ua.includes('chrome')
        
        return isSafariBrowser || isIOSSafari || isPlaywrightWebkit
      }
      
      return testIsSafari()
    })
    
    console.log('Module isSafari test result:', moduleTestResult)
    
    // Check test environment flags
    const envInfo = await page.evaluate(() => {
      return {
        // @ts-ignore
        testEnv: !!window.__TEST_ENV__,
        // @ts-ignore
        mockData: !!window.__MOCK_MYLIST_DATA__,
        windowType: typeof window,
        navigatorType: typeof navigator
      }
    })
    
    console.log('Environment info:', envInfo)
    
    // Log what components are actually visible on mylists page
    const componentsVisible = await page.evaluate(() => {
      return {
        safariWarning: !!document.querySelector('[data-testid="safari-persistence-warning"]'),
        exportButton: !!document.querySelector('[data-testid="export-mylists-button"]'),
        importButton: !!document.querySelector('[data-testid="import-mylists-button"]'),
        hasMylistBackup: !!document.querySelector('.mylist-backup'),
        hasSafariWarning: !!document.querySelector('.safari-warning'),
        hasDataManagement: !!document.querySelector('.data-management'),
        hasDataActions: !!document.querySelector('.data-actions'),
        isLoading: document.body.textContent?.includes('読み込み中...')
      }
    })
    
    console.log('Components visible on mylists page:', componentsVisible)
    
    // Check the React component tree
    const reactInfo = await page.evaluate(() => {
      const container = document.querySelector('.container')
      if (container) {
        return {
          hasContainer: true,
          innerHTML: container.innerHTML.substring(0, 500) + '...'
        }
      }
      return { hasContainer: false }
    })
    
    console.log('React container info:', reactInfo)
    
    expect(userAgent).toBeDefined()
  })
})
*/