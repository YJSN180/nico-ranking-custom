// Playwright を使った解決策の例

import { chromium } from 'playwright'

async function getRankingWithPlaywright() {
  console.log('=== Playwright を使った例のソレジャンル取得 ===')
  
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
        name: 'user_session',
        value: 'user_session_54116935_56e7cd07bafc0c91b4e87baec017fe86bc64e014cf01c1f5cf07eaf02f0503f6',
        domain: '.nicovideo.jp',
        path: '/'
      },
      {
        name: 'sensitive_material_status',
        value: 'accept',
        domain: '.nicovideo.jp',
        path: '/'
      }
    ])
    
    const page = await context.newPage()
    
    // ネットワークリクエストを監視
    page.on('response', async (response) => {
      const url = response.url()
      if (url.includes('nvapi.nicovideo.jp') && url.includes('ranking')) {
        console.log(`\nAPI Call detected: ${url}`)
        console.log(`Status: ${response.status()}`)
        
        if (response.ok()) {
          try {
            const data = await response.json()
            console.log('Response data keys:', Object.keys(data))
          } catch (e) {
            // JSONでない場合は無視
          }
        }
      }
    })
    
    // 例のソレジャンルのMMDタグランキングにアクセス
    const url = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=MMD'
    console.log(`\nNavigating to: ${url}`)
    
    await page.goto(url, { waitUntil: 'networkidle' })
    
    // ページタイトルを確認
    const title = await page.title()
    console.log(`Page title: ${title}`)
    
    // 動画要素を取得
    const videos = await page.evaluate(() => {
      const items = []
      
      // data-video-id属性を持つ要素を探す
      const videoElements = document.querySelectorAll('[data-video-id]')
      
      videoElements.forEach((el) => {
        const videoId = el.getAttribute('data-video-id')
        const titleEl = el.querySelector('h3, .title, [class*="title"]')
        const viewEl = el.querySelector('[class*="view"]')
        
        if (videoId) {
          items.push({
            id: videoId,
            title: titleEl?.textContent?.trim(),
            views: viewEl?.textContent?.trim()
          })
        }
      })
      
      return items
    })
    
    console.log(`\n取得した動画数: ${videos.length}`)
    if (videos.length > 0) {
      console.log('\n最初の5件:')
      videos.slice(0, 5).forEach((video, i) => {
        console.log(`${i + 1}. ${video.title || 'タイトル不明'} (${video.id})`)
        if (video.views) console.log(`   ${video.views}`)
      })
    }
    
  } finally {
    await browser.close()
  }
}

// 実行
if (process.argv[1] === import.meta.url) {
  getRankingWithPlaywright().catch(console.error)
}