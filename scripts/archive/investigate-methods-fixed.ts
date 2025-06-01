// ニコニコチャートやニコログが使っている可能性のある全ての方法を調査

async function investigateAllMethods() {
  console.log('=== あらゆる可能性を調査 ===\n')
  
  // 1. 古いAPIエンドポイント
  console.log('1. レガシーAPIエンドポイントの調査')
  const legacyEndpoints = [
    // 旧API
    'https://api.ce.nicovideo.jp/nicoapi/v1/ranking/genre/d2um7mc4',
    'https://public.api.nicovideo.jp/v1/ranking/genre/d2um7mc4',
    'https://api.nicovideo.jp/v1/ranking.genre?id=d2um7mc4',
    
    // 内部API
    'https://nvapi.nicovideo.jp/v1/ranking/genre/d2um7mc4',
    'https://nvapi.nicovideo.jp/v2/ranking/genre/d2um7mc4',
    'https://nvapi.nicovideo.jp/v1/genres/d2um7mc4/ranking',
    
    // XML API
    'https://www.nicovideo.jp/ranking/genre/d2um7mc4?page=1&lang=ja-jp&format=xml',
    'https://ext.nicovideo.jp/api/getthumbinfo/ranking/d2um7mc4',
    
    // スナップショットAPI
    'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=&targets=tags&fields=contentId,title,viewCounter&filters[genre][0]=d2um7mc4&_sort=-viewCounter&_limit=100',
    
    // 検索API経由
    'https://api.search.nicovideo.jp/api/v2/video/contents/search?q=&targets=tags_exact&fields=contentId,title,viewCounter,thumbnailUrl&filters[genre][0]=例のソレ&_sort=-startTime&_limit=100'
  ]
  
  for (const endpoint of legacyEndpoints) {
    console.log(`\nテスト: ${endpoint.substring(0, 60)}...`)
    try {
      const response = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json, application/xml, text/xml, */*',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0'
        }
      })
      console.log(`Status: ${response.status}`)
      if (response.status === 200) {
        console.log('✅ 成功！')
        const contentType = response.headers.get('content-type')
        console.log(`Content-Type: ${contentType}`)
      }
    } catch (error: any) {
      console.log(`Error: ${error.message}`)
    }
  }
  
  // 2. Cookie/認証の組み合わせ
  console.log('\n\n2. 特殊な認証方法')
  const authMethods = [
    {
      name: 'ニコニコプレミアム会員Cookie',
      headers: {
        'Cookie': 'premium_user=1; sensitive_material_status=accept; adult_flag=1'
      }
    },
    {
      name: 'APIキー（推測）',
      headers: {
        'X-Niconico-Api-Key': 'xxxxxxxx',
        'Authorization': 'Bearer xxxxxxxx'
      }
    },
    {
      name: 'アプリケーション認証',
      headers: {
        'X-Application-Name': 'nicochart',
        'X-Application-Version': '1.0'
      }
    }
  ]
  
  // 3. UserAgentを偽装
  console.log('\n\n3. 特殊なUserAgent')
  const userAgents = [
    'NicoChart/1.0',
    'nicolog/1.0',
    'Niconico/1.0 (Android)',
    'Niconico/1.0 (iOS)',
    'Mozilla/5.0 (compatible; Nicochartbot/1.0)',
    'facebookexternalhit/1.1',
    'Twitterbot/1.0'
  ]
  
  for (const ua of userAgents) {
    console.log(`\nUA: ${ua}`)
    try {
      const response = await fetch('https://www.nicovideo.jp/ranking/genre/d2um7mc4', {
        headers: { 'User-Agent': ua }
      })
      const html = await response.text()
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || ''
      console.log(`結果: ${title.includes('例のソレ') ? '✅ 例のソレ' : '❌ ' + title.substring(0, 20)}`)
    } catch (error) {
      console.log('Error')
    }
  }
  
  // 4. Refererの偽装
  console.log('\n\n4. 特殊なReferer')
  const referers = [
    'https://www.nicochart.jp/',
    'https://www.nicolog.jp/',
    'https://dic.nicovideo.jp/',
    'https://ch.nicovideo.jp/',
    'https://www.nicovideo.jp/ranking/genre/all'
  ]
  
  for (const referer of referers) {
    console.log(`\nReferer: ${referer}`)
    try {
      const response = await fetch('https://www.nicovideo.jp/ranking/genre/d2um7mc4', {
        headers: { 
          'Referer': referer,
          'Cookie': 'sensitive_material_status=accept'
        }
      })
      const html = await response.text()
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || ''
      console.log(`結果: ${title.includes('例のソレ') ? '✅ 例のソレ' : '❌'}`)
    } catch (error) {
      console.log('Error')
    }
  }
  
  // 5. 直接的なデータソース
  console.log('\n\n5. 他のデータソース')
  console.log('- ニコニコ大百科API')
  console.log('- ニコニコチャンネルAPI')
  console.log('- ニコニコ静画API（共通基盤）')
  console.log('- ニコニコ生放送API（共通認証）')
  
  // 6. タイミングやレート制限
  console.log('\n\n6. アクセスパターン')
  console.log('- 深夜時間帯のアクセス')
  console.log('- レート制限を避ける遅延アクセス')
  console.log('- セッションの維持')
  
  // 7. プロトコルレベル
  console.log('\n\n7. プロトコルレベルの工夫')
  console.log('- HTTP/2の使用')
  console.log('- WebSocketでの接続')
  console.log('- gRPCエンドポイント')
}

investigateAllMethods().catch(console.error)