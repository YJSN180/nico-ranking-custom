#!/usr/bin/env tsx

// 検索ページのHTMLから直接動画データを抽出

async function parseSearchHTML() {
  console.log('=== 検索ページHTMLからの動画抽出 ===')
  
  const searchUrl = 'https://www.nicovideo.jp/search/BB%E5%85%88%E8%BC%A9%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA?sort=f&order=d'
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: searchUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja',
          'Cookie': 'sensitive_material_status=accept',
        }
      }),
    })

    const proxyData = await response.json()
    const html = proxyData.body
    
    console.log(`HTMLサイズ: ${html.length}文字`)
    
    // 動画IDの抽出パターンを試行
    const videoIdPatterns = [
      /data-video-id="((?:sm|nm|so)\d+)"/g,
      /href="\/watch\/((?:sm|nm|so)\d+)"/g,
      /"contentId":"((?:sm|nm|so)\d+)"/g,
      /"videoId":"((?:sm|nm|so)\d+)"/g
    ]
    
    const allVideoIds = new Set<string>()
    
    videoIdPatterns.forEach((pattern, index) => {
      const matches = html.matchAll(pattern)
      const ids = Array.from(matches).map(match => match[1])
      console.log(`パターン${index + 1}: ${ids.length}個のID検出`)
      ids.forEach(id => allVideoIds.add(id))
    })
    
    console.log(`\n合計ユニーク動画ID: ${allVideoIds.size}個`)
    
    if (allVideoIds.size > 0) {
      const videoIds = Array.from(allVideoIds).slice(0, 15)
      console.log('\n検出された動画ID (上位15個):')
      videoIds.forEach((id, index) => {
        console.log(`${index + 1}. ${id}`)
      })
    }
    
    // タイトルの抽出を試行
    console.log('\n=== タイトル抽出 ===')
    
    const titlePatterns = [
      /<h3[^>]*title[^>]*>([^<]+)<\/h3>/g,
      /<a[^>]*title="([^"]+)"/g,
      /"title":"([^"]+)"/g,
      /<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/g
    ]
    
    const allTitles = new Set<string>()
    
    titlePatterns.forEach((pattern, index) => {
      const matches = html.matchAll(pattern)
      const titles = Array.from(matches).map(match => match[1])
      console.log(`タイトルパターン${index + 1}: ${titles.length}個検出`)
      titles.forEach(title => {
        if (title.length > 5 && title.length < 200) {
          allTitles.add(title)
        }
      })
    })
    
    console.log(`\n合計ユニークタイトル: ${allTitles.size}個`)
    
    if (allTitles.size > 0) {
      const titles = Array.from(allTitles).slice(0, 10)
      console.log('\n検出されたタイトル (上位10個):')
      titles.forEach((title, index) => {
        console.log(`${index + 1}. ${title}`)
      })
    }
    
    // BB先輩関連のタイトルを特別抽出
    const bbTitles = Array.from(allTitles).filter(title => 
      title.includes('BB') || 
      title.includes('先輩') || 
      title.includes('淫夢') ||
      title.includes('例のアレ') ||
      title.includes('クッキー') ||
      title.includes('ホモ')
    )
    
    console.log(`\nBB先輩関連タイトル: ${bbTitles.length}個`)
    bbTitles.slice(0, 10).forEach((title, index) => {
      console.log(`${index + 1}. ${title}`)
    })
    
    // JSONデータの探索
    console.log('\n=== JSONデータ探索 ===')
    const jsonMatches = html.match(/"data":\{[^}]+\}/g)
    if (jsonMatches) {
      console.log(`JSONデータブロック: ${jsonMatches.length}個`)
      jsonMatches.slice(0, 3).forEach((match, index) => {
        console.log(`${index + 1}. ${match.substring(0, 100)}...`)
      })
    }
    
    // script tagでのデータ
    const scriptMatches = html.match(/<script[^>]*>[\s\S]*?window\.__NUXT__[\s\S]*?<\/script>/g)
    if (scriptMatches) {
      console.log(`\nNUXTデータスクリプト: ${scriptMatches.length}個`)
      const scriptContent = scriptMatches[0]
      if (scriptContent.includes('videoId') || scriptContent.includes('title')) {
        console.log('✓ スクリプト内に動画データが含まれている可能性があります')
      }
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

parseSearchHTML().catch(console.error)