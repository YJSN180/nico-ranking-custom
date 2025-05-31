#!/usr/bin/env tsx

// 人気タグの抽出をデバッグするスクリプト

async function debugTags() {
  console.log('=== 人気タグ抽出デバッグ ===')
  
  // ローカルプロキシサーバーからHTMLを取得
  const response = await fetch('http://localhost:8888/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'test-key',
    },
    body: JSON.stringify({
      url: 'https://www.nicovideo.jp/ranking/genre/all?term=24h',
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
  
  console.log(`HTML length: ${html.length}`)
  
  // meta tagの内容を確認
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (metaMatch) {
    console.log('\n=== Meta Tag Analysis ===')
    const encodedData = metaMatch[1]!
    const decodedData = encodedData
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
    
    try {
      const jsonData = JSON.parse(decodedData)
      
      // トレンドタグの確認
      console.log('\nResponse structure:', Object.keys(jsonData.data.response))
      
      if (jsonData.data.response.$getTeibanRankingFeaturedKeyAndTrendTags) {
        console.log('\n$getTeibanRankingFeaturedKeyAndTrendTags structure:', 
          Object.keys(jsonData.data.response.$getTeibanRankingFeaturedKeyAndTrendTags))
        
        const trendData = jsonData.data.response.$getTeibanRankingFeaturedKeyAndTrendTags.data
        if (trendData) {
          console.log('\nTrend data structure:', Object.keys(trendData))
          
          if (trendData.trendTags) {
            console.log(`\nTrend tags count: ${trendData.trendTags.length}`)
            console.log('Sample trend tags:', trendData.trendTags.slice(0, 5))
          }
          
          if (trendData.featuredKeys) {
            console.log(`\nFeatured keys count: ${trendData.featuredKeys.length}`)
            console.log('Sample featured keys:', trendData.featuredKeys.slice(0, 5))
          }
        }
      }
      
      if (jsonData.data.response.$getTeibanRankingFeaturedKeys) {
        console.log('\n$getTeibanRankingFeaturedKeys structure:', 
          Object.keys(jsonData.data.response.$getTeibanRankingFeaturedKeys))
      }
      
    } catch (error) {
      console.error('JSON parsing error:', error)
    }
  }
  
  // HTMLから直接タグを検索
  console.log('\n=== HTML Tag Search ===')
  
  // タグの可能性があるパターンを広範囲に検索
  const patterns = [
    { name: 'tag class', pattern: /class="[^"]*tag[^"]*"/g },
    { name: 'tag href', pattern: /href="[^"]*tag[^"]*"/g },
    { name: 'data-tag', pattern: /data-tag="[^"]+"/g },
    { name: 'trend', pattern: /class="[^"]*trend[^"]*"/g },
    { name: 'popular', pattern: /class="[^"]*popular[^"]*"/g }
  ]
  
  patterns.forEach(({ name, pattern }) => {
    const matches = html.match(pattern)
    if (matches) {
      console.log(`\n${name}: ${matches.length} matches`)
      console.log('Sample:', matches.slice(0, 3))
    } else {
      console.log(`\n${name}: No matches`)
    }
  })
  
  // 「タグ」という文字を含む部分を検索
  const tagSections = html.match(/[\s\S]{0,200}タグ[\s\S]{0,200}/g)
  if (tagSections) {
    console.log(`\n=== "タグ" sections found: ${tagSections.length} ===`)
    tagSections.slice(0, 2).forEach((section, i) => {
      console.log(`\nSection ${i+1}:`)
      console.log(section.replace(/\s+/g, ' ').trim())
    })
  }
  
  // ランキングページの一般的なUI要素を検索
  const uiElements = [
    { name: 'Navigation', pattern: /<nav[\s\S]*?<\/nav>/g },
    { name: 'Sidebar', pattern: /<aside[\s\S]*?<\/aside>/g },
    { name: 'Section headers', pattern: /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/g }
  ]
  
  console.log('\n=== UI Elements ===')
  uiElements.forEach(({ name, pattern }) => {
    const matches = html.match(pattern)
    if (matches) {
      console.log(`\n${name}: ${matches.length} found`)
      if (name === 'Section headers') {
        const headers = matches.slice(0, 10).map(match => {
          const headerMatch = match.match(/>([^<]+)</)
          return headerMatch ? headerMatch[1] : match
        })
        console.log('Headers:', headers)
      }
    }
  })
}

debugTags().catch(console.error)