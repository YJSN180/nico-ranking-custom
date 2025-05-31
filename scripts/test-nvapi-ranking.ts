// nvapi経由でランキングを取得する方法を探る

async function testNvapiRanking() {
  console.log('=== nvapi経由でのランキング取得テスト ===\n')
  
  // nvapi.nicovideo.jpのエンドポイントを調査
  const endpoints = [
    // v1エンドポイント
    'https://nvapi.nicovideo.jp/v1/tmp/ranking/genre/d2um7mc4?term=24h',
    'https://nvapi.nicovideo.jp/v1/ranking-rss/genre/d2um7mc4?term=24h',
    'https://nvapi.nicovideo.jp/v1/explore/ranking/genre/d2um7mc4',
    
    // 総合ランキング（動作確認用）
    'https://nvapi.nicovideo.jp/v1/tmp/ranking/genre/all?term=24h',
    
    // タグ検索API
    'https://nvapi.nicovideo.jp/v1/search/tag/R-18?sortKey=hot',
    'https://nvapi.nicovideo.jp/v1/tag-search/R-18?sort=hot',
    
    // 特殊なパラメータ
    'https://nvapi.nicovideo.jp/v1/ranking?genre=d2um7mc4&term=24h',
    'https://nvapi.nicovideo.jp/v1/genres/d2um7mc4/ranking?term=24h'
  ]
  
  for (const endpoint of endpoints) {
    console.log(`\nテスト: ${endpoint}`)
    
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'X-Niconico-Language': 'ja-jp',
          'Cookie': 'sensitive_material_status=accept',
          'User-Agent': 'Mozilla/5.0'
        }
      })
      
      console.log(`Status: ${response.status}`)
      const contentType = response.headers.get('content-type')
      console.log(`Content-Type: ${contentType}`)
      
      if (response.status === 200) {
        if (contentType?.includes('json')) {
          const data = await response.json()
          console.log('✅ JSONレスポンス取得成功')
          console.log('データキー:', Object.keys(data).slice(0, 10))
          
          // ランキングデータがあるか確認
          if (data.data?.items || data.items || data.ranking) {
            const items = data.data?.items || data.items || data.ranking
            console.log(`アイテム数: ${items.length}`)
            if (items.length > 0) {
              console.log(`最初のアイテム: ${items[0].title || items[0].name || 'タイトル不明'}`)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error.message)
    }
  }
  
  // 実際に動作しているエンドポイントを解析
  console.log('\n\n=== 既知の動作するエンドポイントの解析 ===')
  try {
    const workingUrl = 'https://www.nicovideo.jp/ranking/genre/all'
    const response = await fetch(workingUrl)
    const html = await response.text()
    
    // ネットワークリクエストを解析するためのパターンを探す
    const nvapiCalls = html.matchAll(/nvapi\.nicovideo\.jp\/v[0-9]\/[^"'\s]+/g)
    const foundEndpoints = new Set<string>()
    
    for (const match of nvapiCalls) {
      foundEndpoints.add(match[0])
    }
    
    if (foundEndpoints.size > 0) {
      console.log('HTMLから発見したnvapiエンドポイント:')
      foundEndpoints.forEach(ep => console.log(`- ${ep}`))
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

testNvapiRanking().catch(console.error)