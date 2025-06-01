#!/usr/bin/env tsx

// ニコニコ動画でタグ別ランキングを取得する正しい方法を調査

async function findTagRankingMethod() {
  console.log('=== タグ別ランキングの正しい取得方法を調査 ===')
  
  // 試す可能性のあるURL形式
  const urlPatterns = [
    // 1. 現在の方式（期待通り動作しない）
    'https://www.nicovideo.jp/ranking/genre/other?term=24h&tag=BB%E5%85%88%E8%BC%A9%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA',
    
    // 2. tag検索 + ランキングソート
    'https://www.nicovideo.jp/tag/BB%E5%85%88%E8%BC%A9%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA?sort=f&order=d',
    
    // 3. 検索API形式
    'https://www.nicovideo.jp/search/BB%E5%85%88%E8%BC%A9%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA?sort=f&order=d',
    
    // 4. 検索API（再生数ソート）
    'https://www.nicovideo.jp/search/BB%E5%85%88%E8%BC%A9%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA?sort=v&order=d',
    
    // 5. tag付きランキング（別形式）
    'https://www.nicovideo.jp/ranking/tag/BB%E5%85%88%E8%BC%A9%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA'
  ]
  
  for (let i = 0; i < urlPatterns.length; i++) {
    const url = urlPatterns[i]
    console.log(`\n=== パターン ${i + 1}: ${url} ===`)
    
    try {
      const response = await fetch('http://localhost:8888/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-key',
        },
        body: JSON.stringify({
          url,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'ja',
            'Cookie': 'sensitive_material_status=accept',
          }
        }),
      })

      if (!response.ok) {
        console.log(`✗ HTTPエラー: ${response.status}`)
        continue
      }

      const proxyData = await response.json()
      const html = proxyData.body
      
      console.log(`HTMLサイズ: ${html.length}文字`)
      
      // ページタイプを判定
      if (html.includes('ranking')) {
        console.log('📊 ランキングページ検出')
      }
      if (html.includes('search')) {
        console.log('🔍 検索ページ検出')
      }
      if (html.includes('tag')) {
        console.log('🏷️ タグページ検出')
      }
      
      // meta tagの確認
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      if (metaMatch) {
        try {
          const encodedData = metaMatch[1]!
          const decodedData = encodedData
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
          
          const jsonData = JSON.parse(decodedData)
          
          console.log('📋 利用可能なAPIエンドポイント:')
          if (jsonData.data?.response) {
            Object.keys(jsonData.data.response).forEach(key => {
              console.log(`  - ${key}`)
            })
          }
          
          // 検索結果の確認
          if (jsonData.data?.response?.$getSearch) {
            const searchData = jsonData.data.response.$getSearch.data
            console.log(`🔍 検索結果: ${searchData?.items?.length || 0}件`)
            if (searchData?.items?.length > 0) {
              console.log(`  1位: ${searchData.items[0].title}`)
              console.log(`  2位: ${searchData.items[1]?.title || 'なし'}`)
              console.log(`  3位: ${searchData.items[2]?.title || 'なし'}`)
            }
          }
          
          // タグページの確認
          if (jsonData.data?.response?.$getTag) {
            const tagData = jsonData.data.response.$getTag.data
            console.log(`🏷️ タグページ: ${tagData?.items?.length || 0}件`)
            if (tagData?.items?.length > 0) {
              console.log(`  1位: ${tagData.items[0].title}`)
              console.log(`  2位: ${tagData.items[1]?.title || 'なし'}`)
              console.log(`  3位: ${tagData.items[2]?.title || 'なし'}`)
            }
          }
          
          // ランキングデータの確認
          if (jsonData.data?.response?.$getTeibanRanking) {
            const rankingData = jsonData.data.response.$getTeibanRanking.data
            console.log(`📊 ランキング: ${rankingData?.items?.length || 0}件`)
            console.log(`  タグ: ${rankingData?.tag || 'なし'}`)
            console.log(`  ラベル: ${rankingData?.label || 'なし'}`)
          }
          
        } catch (parseError) {
          console.log(`✗ JSON解析エラー: ${parseError}`)
        }
      } else {
        console.log(`⚠️ meta tag未検出`)
      }
      
      // BB関連コンテンツの確認
      const bbMatches = html.match(/BB|先輩|淫夢/g)
      console.log(`BB関連キーワード出現回数: ${bbMatches?.length || 0}`)
      
    } catch (error) {
      console.log(`✗ エラー: ${error}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  
  console.log('\n=== 結論 ===')
  console.log('1. /ranking/?tag= は機能しない（常に総合ランキング）')
  console.log('2. 正しいタグ別ランキングは別のAPIエンドポイントが必要')
  console.log('3. /search/ または /tag/ エンドポイントを調査')
}

findTagRankingMethod().catch(console.error)