// Playwrightを使って例のソレジャンルを解析（既にインストール済み）

import { chromium } from '@playwright/test'

async function analyzeWithPlaywright() {
  console.log('=== Playwrightで例のソレジャンルを解析 ===\n')
  
  const browser = await chromium.launch({
    headless: true
  })
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'ja-JP'
    })
    
    // Cookieを設定
    await context.addCookies([
      {
        name: 'sensitive_material_status',
        value: 'accept',
        domain: '.nicovideo.jp',
        path: '/'
      }
    ])
    
    const page = await context.newPage()
    
    // ネットワークリクエストを監視
    const apiCalls: any[] = []
    
    page.on('request', request => {
      const url = request.url()
      if (url.includes('nvapi') || url.includes('ranking') || url.includes('d2um7mc4')) {
        console.log(`📡 Request: ${request.method()} ${url}`)
        apiCalls.push({
          url,
          method: request.method(),
          headers: request.headers()
        })
      }
    })
    
    page.on('response', async response => {
      const url = response.url()
      if (url.includes('nvapi') || url.includes('ranking') || url.includes('d2um7mc4')) {
        console.log(`📥 Response: ${response.status()} ${url}`)
        
        try {
          const contentType = response.headers()['content-type']
          if (contentType?.includes('json') && response.ok()) {
            const body = await response.body()
            const json = JSON.parse(body.toString())
            console.log('📊 JSONデータ:', Object.keys(json).slice(0, 10))
            
            // ランキングデータを保存
            if (json.data?.items || json.items || json.ranking) {
              const fs = await import('fs')
              fs.writeFileSync('playwright-ranking-data.json', JSON.stringify(json, null, 2))
              console.log('💾 ランキングデータを保存しました')
            }
          }
        } catch (e) {
          // エラーは無視
        }
      }
    })
    
    console.log('\n例のソレジャンルにアクセス中...')
    await page.goto('https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=hour', {
      waitUntil: 'networkidle'
    })
    
    // ページ情報
    const title = await page.title()
    const url = page.url()
    console.log(`\nページタイトル: ${title}`)
    console.log(`現在のURL: ${url}`)
    
    // JavaScriptで直接データを取得
    const pageData = await page.evaluate(() => {
      const result: any = {}
      
      // window.__remixContextを確認
      if ((window as any).__remixContext) {
        const remixData = (window as any).__remixContext
        result.hasRemixContext = true
        result.loaderDataKeys = Object.keys(remixData.state?.loaderData || {})
      }
      
      // server-responseメタタグを解析
      const serverResponseMeta = document.querySelector('meta[name="server-response"]')
      if (serverResponseMeta) {
        try {
          const content = serverResponseMeta.getAttribute('content') || ''
          const decoded = content
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
          const data = JSON.parse(decoded)
          result.serverResponse = data
        } catch (e) {
          result.serverResponseError = true
        }
      }
      
      return result
    })
    
    console.log('\nページ内データ:')
    if (pageData.hasRemixContext) {
      console.log('✅ RemixContextあり')
      console.log('LoaderDataキー:', pageData.loaderDataKeys)
    }
    
    if (pageData.serverResponse) {
      const response = pageData.serverResponse
      const rankingData = response.data?.response?.$getTeibanRanking?.data
      
      if (rankingData) {
        console.log(`\n📊 ランキングデータ発見:`)
        console.log(`ジャンル: ${rankingData.label} (${rankingData.featuredKey})`)
        console.log(`アイテム数: ${rankingData.items?.length || 0}`)
        
        if (rankingData.featuredKey === 'd2um7mc4') {
          console.log('🎯 例のソレジャンルのデータを取得成功！')
        } else {
          console.log('⚠️ 別のジャンルにリダイレクトされました')
        }
      }
    }
    
    // スクリーンショット
    await page.screenshot({ path: 'playwright-reisore.png', fullPage: true })
    console.log('\n💾 スクリーンショットを保存: playwright-reisore.png')
    
    // APIコールのサマリー
    console.log('\n\n=== APIコールサマリー ===')
    const uniqueApis = [...new Set(apiCalls.map(c => c.url))]
    uniqueApis.forEach(api => {
      console.log(`- ${api}`)
    })
    
  } finally {
    await browser.close()
  }
}

analyzeWithPlaywright().catch(console.error)