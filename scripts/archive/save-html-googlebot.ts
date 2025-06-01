// Googlebotとして取得したHTMLを保存して分析

import { writeFileSync } from 'fs'

async function saveHTML() {
  const url = 'https://www.nicovideo.jp/ranking/genre/all?term=24h'
  
  console.log(`Fetching: ${url}`)
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    })
    
    console.log(`Response status: ${response.status}`)
    console.log('Response headers:')
    response.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`)
    })
    
    const html = await response.text()
    console.log(`HTML length: ${html.length}`)
    
    // HTMLを保存
    writeFileSync('googlebot-response.html', html)
    console.log('HTML saved to googlebot-response.html')
    
    // HTMLの内容を分析
    console.log('\n=== HTML分析 ===')
    
    // タイトルタグ
    const titleMatch = html.match(/<title>([^<]+)<\/title>/)
    if (titleMatch) {
      console.log('Title:', titleMatch[1])
    }
    
    // meta robots
    const robotsMatch = html.match(/<meta name="robots" content="([^"]+)"/)
    if (robotsMatch) {
      console.log('Robots meta:', robotsMatch[1])
    }
    
    // センシティブコンテンツの警告
    if (html.includes('センシティブ') || html.includes('sensitive')) {
      console.log('⚠️ センシティブコンテンツの警告が含まれています')
    }
    
    // 動画IDの存在確認
    const hasVideoIds = html.includes('data-video-id') || html.includes('sm') || html.includes('contentId')
    console.log('動画ID関連の文字列が含まれているか:', hasVideoIds)
    
    // HTMLの最初の1000文字を表示
    console.log('\n=== HTML冒頭 ===')
    console.log(html.substring(0, 1000))
    
    // scriptタグの数
    const scriptCount = (html.match(/<script/g) || []).length
    console.log(`\nScriptタグの数: ${scriptCount}`)
    
    // RemixContextの存在確認
    if (html.includes('__remix-context__')) {
      console.log('✓ RemixContextが存在します')
      const remixMatch = html.match(/<script id="__remix-context__"[^>]*>/)
      if (remixMatch) {
        const startIndex = html.indexOf(remixMatch[0])
        console.log('RemixContext preview:', html.substring(startIndex, startIndex + 200))
      }
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

saveHTML().catch(console.error)