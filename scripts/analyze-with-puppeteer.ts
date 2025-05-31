// Puppeteerを使って例のソレジャンルのネットワークリクエストを解析

import puppeteer from 'puppeteer'

async function analyzeWithPuppeteer() {
  console.log('=== Puppeteerで例のソレジャンルを解析 ===\n')
  
  let browser
  try {
    // ブラウザを起動
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    const page = await browser.newPage()
    
    // ネットワークリクエストを監視
    const requests: any[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (url.includes('nvapi') || url.includes('ranking') || url.includes('d2um7mc4')) {
        requests.push({
          url,
          method: request.method(),
          headers: request.headers(),
          postData: request.postData()
        })
      }
    })
    
    // レスポンスも監視
    const responses: any[] = []
    page.on('response', async (response) => {
      const url = response.url()
      if (url.includes('nvapi') || url.includes('ranking') || url.includes('d2um7mc4')) {
        try {
          const contentType = response.headers()['content-type']
          responses.push({
            url,
            status: response.status(),
            contentType,
            ok: response.ok()
          })
          
          // JSONレスポンスの場合は内容も取得
          if (contentType?.includes('json') && response.ok()) {
            const json = await response.json()
            console.log(`\n📊 JSONレスポンス検出: ${url}`)
            console.log('データキー:', Object.keys(json).slice(0, 10))
          }
        } catch (e) {
          // エラーは無視
        }
      }
    })
    
    // Cookieを設定
    await page.setCookie({
      name: 'sensitive_material_status',
      value: 'accept',
      domain: '.nicovideo.jp'
    })
    
    console.log('ページを読み込み中...')
    await page.goto('https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=hour', {
      waitUntil: 'networkidle2',
      timeout: 30000
    })
    
    // ページタイトルを確認
    const title = await page.title()
    console.log(`\nページタイトル: ${title}`)
    
    // 現在のURLを確認（リダイレクトされたか）
    const currentUrl = page.url()
    console.log(`現在のURL: ${currentUrl}`)
    
    // ページ内のデータを探す
    const pageData = await page.evaluate(() => {
      const data: any = {}
      
      // window.__remixContext
      if ((window as any).__remixContext) {
        data.remixContext = (window as any).__remixContext
      }
      
      // 例のソレ関連の要素を探す
      const genreElements = document.querySelectorAll('[data-genre="d2um7mc4"]')
      data.genreElementsCount = genreElements.length
      
      // ランキングアイテムを探す
      const rankingItems = document.querySelectorAll('[class*="RankingItem"], [class*="ranking-item"]')
      data.rankingItemsCount = rankingItems.length
      
      if (rankingItems.length > 0) {
        data.firstItemTitle = rankingItems[0].textContent?.trim()
      }
      
      return data
    })
    
    console.log('\nページ内データ:')
    console.log('- genreElements:', pageData.genreElementsCount)
    console.log('- rankingItems:', pageData.rankingItemsCount)
    if (pageData.firstItemTitle) {
      console.log('- 最初のアイテム:', pageData.firstItemTitle.substring(0, 50))
    }
    
    // ネットワークリクエストのサマリー
    console.log('\n\n=== ネットワークリクエスト ===')
    console.log(`総リクエスト数: ${requests.length}`)
    
    const uniqueUrls = [...new Set(requests.map(r => r.url))]
    console.log('\nユニークなURL:')
    uniqueUrls.forEach(url => {
      console.log(`- ${url}`)
    })
    
    // 成功したレスポンス
    console.log('\n\n=== 成功したレスポンス ===')
    responses.filter(r => r.ok).forEach(r => {
      console.log(`✅ ${r.status} ${r.contentType} - ${r.url}`)
    })
    
    // スクリーンショットを保存
    await page.screenshot({ path: 'reisore-puppeteer.png', fullPage: true })
    console.log('\n💾 スクリーンショットを保存しました: reisore-puppeteer.png')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// 実行
analyzeWithPuppeteer().catch(console.error)