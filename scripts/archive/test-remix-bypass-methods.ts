// Remixフレームワークの特性を利用して例のソレジャンルのブロックを回避する方法を検証

async function testRemixBypassMethods() {
  console.log('=== Remix特性を利用した例のソレジャンル取得テスト ===\n')
  console.log(new Date().toLocaleString('ja-JP'))
  console.log('\n')
  
  // 方法1: Remixのローダーデータを直接リクエスト
  console.log('=== 方法1: Remixローダーエンドポイントを直接呼び出し ===')
  try {
    // Remixは通常、データフェッチ用のAPIエンドポイントを持つ
    const loaderUrl = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?_data=routes%2Franking.genre.%24genreId'
    console.log(`URL: ${loaderUrl}`)
    
    const response = await fetch(loaderUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': 'sensitive_material_status=accept',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
    
    console.log(`Status: ${response.status}`)
    const contentType = response.headers.get('content-type')
    console.log(`Content-Type: ${contentType}`)
    
    if (response.status === 200 && contentType?.includes('json')) {
      const data = await response.json()
      console.log('✅ JSONデータ取得成功')
      console.log('データキー:', Object.keys(data))
    }
  } catch (error) {
    console.error('Error:', error)
  }
  
  // 方法2: window.__remixContextを利用
  console.log('\n\n=== 方法2: __remixContextデータを解析 ===')
  try {
    const url = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=hour'
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': 'sensitive_material_status=accept; user_session=user_session_54116935_56e7cd07bafc0c91b4e87baec017fe86bc64e014cf01c1f5cf07eaf02f0503f6'
      }
    })
    
    if (response.status === 200) {
      const html = await response.text()
      
      // __remixContextを探す
      const remixMatch = html.match(/window\.__remixContext\s*=\s*({[\s\S]+?});/)
      if (remixMatch) {
        console.log('✅ __remixContext発見')
        try {
          const remixData = JSON.parse(remixMatch[1])
          console.log('Remixデータ構造:')
          console.log('- state.loaderData keys:', Object.keys(remixData.state?.loaderData || {}))
          
          // ルートごとのデータを確認
          for (const [route, data] of Object.entries(remixData.state?.loaderData || {})) {
            console.log(`\nRoute: ${route}`)
            if (typeof data === 'object' && data !== null) {
              console.log('  Keys:', Object.keys(data).slice(0, 10))
            }
          }
        } catch (e) {
          console.error('Remix解析エラー:', e)
        }
      }
    }
  } catch (error) {
    console.error('Error:', error)
  }
  
  // 方法3: 特殊なクエリパラメータやヘッダー
  console.log('\n\n=== 方法3: 特殊なパラメータ/ヘッダーテスト ===')
  const specialParams = [
    { name: 'force=true', url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?force=true&term=hour' },
    { name: 'sensitive=1', url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?sensitive=1&term=hour' },
    { name: 'adult=1', url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?adult=1&term=hour' },
    { name: '_bypass=1', url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?_bypass=1&term=hour' }
  ]
  
  for (const param of specialParams) {
    console.log(`\nテスト: ${param.name}`)
    try {
      const response = await fetch(param.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Cookie': 'sensitive_material_status=accept',
          'X-Adult-Content': 'true',
          'X-Sensitive-Content': 'true'
        }
      })
      
      console.log(`Status: ${response.status}`)
      
      if (response.status === 200) {
        const html = await response.text()
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
        console.log(`Title: ${titleMatch?.[1] || 'N/A'}`)
        
        // 例のソレコンテンツがあるか確認
        if (html.includes('例のソレ') || html.includes('d2um7mc4')) {
          console.log('🎯 例のソレコンテンツを検出！')
        }
      }
    } catch (error) {
      console.error('Error')
    }
  }
  
  // 方法4: APIエンドポイントの推測
  console.log('\n\n=== 方法4: 内部APIエンドポイントの探索 ===')
  const apiEndpoints = [
    'https://nvapi.nicovideo.jp/v1/ranking/genre/d2um7mc4?term=hour',
    'https://nvapi.nicovideo.jp/v2/ranking/genre/d2um7mc4?term=hour',
    'https://www.nicovideo.jp/api/ranking/genre/d2um7mc4?term=hour',
    'https://www.nicovideo.jp/api/v1/ranking/genre/d2um7mc4'
  ]
  
  for (const endpoint of apiEndpoints) {
    console.log(`\nAPI: ${endpoint}`)
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Cookie': 'sensitive_material_status=accept'
        }
      })
      
      console.log(`Status: ${response.status}`)
      
      if (response.status === 200) {
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('json')) {
          console.log('✅ JSON APIエンドポイント発見！')
        }
      }
    } catch (error) {
      console.error('Error')
    }
  }
}

testRemixBypassMethods().catch(console.error)