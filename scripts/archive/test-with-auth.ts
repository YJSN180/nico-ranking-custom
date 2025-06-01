#!/usr/bin/env tsx

// 認証付きでHTMLを取得してタグボタンを確認

async function testWithAuth() {
  console.log('=== 認証付きでHTMLを取得してタグボタンを確認 ===')
  
  const url = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h'
  
  // より詳細なCookieとヘッダーを設定
  const authHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    // R-18コンテンツ表示に必要なCookie
    'Cookie': 'sensitive_material_status=accept; mature_content=accept; adult_content_filter=off; nicohistory=; nicosid=; user_session=; login_status=login'
  }
  
  try {
    console.log('リクエスト送信中...')
    
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url,
        headers: authHeaders
      }),
    })

    const proxyData = await response.json()
    const html = proxyData.body
    
    console.log(`HTMLサイズ: ${html.length}文字`)
    
    // 期待されるタグ
    const expectedTags = ['すべて', 'R-18', '紳士向け', 'MMD', 'ボイロAV']
    
    console.log('\n=== 認証付きでのタグ検索 ===')
    expectedTags.forEach(tag => {
      const count = (html.match(new RegExp(tag, 'g')) || []).length
      console.log(`「${tag}」: ${count}回出現`)
    })
    
    // ページの全体的な構造を確認
    console.log('\n=== ページ構造の確認 ===')
    
    // タイトル
    const titleMatch = html.match(/<title>([^<]+)<\/title>/)
    if (titleMatch) {
      console.log(`ページタイトル: ${titleMatch[1]}`)
    }
    
    // ログイン状態の確認
    const loginIndicators = [
      'ログイン',
      'login',
      'user',
      'プレミアム',
      'premium',
      'ニックネーム',
      'nickname'
    ]
    
    loginIndicators.forEach(indicator => {
      const count = (html.match(new RegExp(indicator, 'gi')) || []).length
      if (count > 0) {
        console.log(`  ${indicator}: ${count}回出現`)
      }
    })
    
    // R-18関連の要素を探す
    console.log('\n=== R-18関連要素の検索 ===')
    
    const r18Patterns = [
      /adult/gi,
      /mature/gi,
      /18/g,
      /成人/gi,
      /大人/gi
    ]
    
    r18Patterns.forEach((pattern, index) => {
      const matches = html.match(pattern)
      if (matches) {
        console.log(`  パターン${index + 1}: ${matches.length}個マッチ`)
      }
    })
    
    // フィルター関連の要素を探す
    console.log('\n=== フィルター/タブ要素の検索 ===')
    
    const filterPatterns = [
      /<(?:div|section|nav)[^>]*class="[^"]*(?:filter|tab|genre|category)[^"]*"[^>]*>[\s\S]*?<\/(?:div|section|nav)>/gi,
      /<ul[^>]*class="[^"]*(?:filter|tab|genre|category)[^"]*"[^>]*>[\s\S]*?<\/ul>/gi
    ]
    
    filterPatterns.forEach((pattern, index) => {
      const matches = html.match(pattern)
      if (matches) {
        console.log(`\nフィルターパターン${index + 1} (${matches.length}個):`)
        matches.slice(0, 2).forEach((match, matchIndex) => {
          console.log(`  ${matchIndex + 1}. ${match.substring(0, 200)}...`)
        })
      }
    })
    
    // 実際にブラウザで見えているはずの内容が存在するか確認
    console.log('\n=== ブラウザ表示内容の確認 ===')
    
    // スクリーンショットに見える動画タイトルがあるか確認
    const videoTitlePatterns = [
      'MMD',
      'ポケモン',
      'メスガキ',
      'サンゴ',
      'ダイナミック',
      '騎乗',
      'R-18'
    ]
    
    videoTitlePatterns.forEach(pattern => {
      if (html.includes(pattern)) {
        console.log(`✓ 動画関連: 「${pattern}」を発見`)
      }
    })
    
    // 現在取得しているのが本当に例のソレジャンルなのか確認
    console.log('\n=== ジャンル確認 ===')
    const currentUrl = url
    console.log(`リクエストURL: ${currentUrl}`)
    
    // meta tagから実際のジャンル情報を確認
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    if (metaMatch) {
      const encodedData = metaMatch[1]!
      const decodedData = encodedData
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
      
      const jsonData = JSON.parse(decodedData)
      const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
      
      if (rankingData) {
        console.log(`実際のジャンル: ${rankingData.label}`)
        console.log(`フィーチャーキー: ${rankingData.featuredKey}`)
        
        if (rankingData.items && rankingData.items.length > 0) {
          console.log(`動画例: ${rankingData.items[0].title}`)
        }
      }
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
  
  console.log('\n=== 結論 ===')
  console.log('認証やCookie設定を強化してHTMLを再取得しました。')
  console.log('スクリーンショットの内容と一致しない場合、以下の原因が考えられます:')
  console.log('1. ニコニコ動画への実際のログインが必要')
  console.log('2. 地域制限やアクセス制御')
  console.log('3. JavaScriptによる動的コンテンツ生成')
  console.log('4. プロキシサーバーでは制限されているコンテンツ')
}

testWithAuth().catch(console.error)