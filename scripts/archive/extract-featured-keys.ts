#!/usr/bin/env tsx

// $getTeibanRankingFeaturedKeys から人気タグを抽出

async function extractFeaturedKeys() {
  console.log('=== Featured Keys（人気タグ）の抽出 ===')
  
  const url = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h'
  
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

    const proxyData = await response.json()
    const html = proxyData.body
    
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    if (metaMatch) {
      const encodedData = metaMatch[1]!
      const decodedData = encodedData
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
      
      const jsonData = JSON.parse(decodedData)
      
      // Featured Keys を抽出
      const featuredKeysData = jsonData?.data?.response?.$getTeibanRankingFeaturedKeys?.data
      
      if (featuredKeysData && featuredKeysData.items) {
        console.log(`✓ Featured Keys取得成功: ${featuredKeysData.items.length}個`)
        
        console.log(`\n=== 人気タグ一覧 ===`)
        
        // 期待されるタグ（スクリーンショットから）
        const expectedTags = ['すべて', 'R-18', '紳士向け', 'MMD', 'ホモAV']
        
        featuredKeysData.items.forEach((item: any, index: number) => {
          const isExpected = expectedTags.includes(item.label)
          console.log(`${index + 1}. ${item.label} (${item.featuredKey}) ${isExpected ? '✅' : ''}`)
          console.log(`   - トップレベル: ${item.isTopLevel ? 'YES' : 'NO'}`)
          console.log(`   - メジャー: ${item.isMajorFeatured ? 'YES' : 'NO'}`)
          console.log(`   - トレンドタグ有効: ${item.isEnabledTrendTag ? 'YES' : 'NO'}`)
        })
        
        console.log(`\n=== スクリーンショットとの照合 ===`)
        expectedTags.forEach(expectedTag => {
          const found = featuredKeysData.items.find((item: any) => item.label === expectedTag)
          if (found) {
            console.log(`✅ ${expectedTag}: 発見 (featuredKey: ${found.featuredKey})`)
          } else {
            console.log(`❌ ${expectedTag}: 未発見`)
          }
        })
        
        // 各タグのIDを使ってランキング取得をテスト
        console.log(`\n=== Featured Key を使ったランキング取得テスト ===`)
        
        // 「紳士向け」や「R-18」などのタグを探す
        const testTargets = featuredKeysData.items.filter((item: any) => 
          item.label === '紳士向け' || 
          item.label === 'R-18' || 
          item.label === 'MMD' ||
          item.label === 'ホモAV'
        )
        
        for (const target of testTargets.slice(0, 2)) { // 最初の2個をテスト
          console.log(`\n--- 「${target.label}」(${target.featuredKey}) のランキングテスト ---`)
          
          // featuredKey を使ったランキング取得
          const featuredUrl = `https://www.nicovideo.jp/ranking/genre/${target.featuredKey}?term=24h`
          console.log(`URL: ${featuredUrl}`)
          
          try {
            const featuredResponse = await fetch('http://localhost:8888/', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'test-key',
              },
              body: JSON.stringify({
                url: featuredUrl,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Accept': 'text/html,application/xhtml+xml',
                  'Accept-Language': 'ja',
                  'Cookie': 'sensitive_material_status=accept',
                }
              }),
            })

            const featuredProxyData = await featuredResponse.json()
            const featuredHtml = featuredProxyData.body
            
            const featuredMetaMatch = featuredHtml.match(/<meta name="server-response" content="([^"]+)"/)
            if (featuredMetaMatch) {
              const featuredEncodedData = featuredMetaMatch[1]!
              const featuredDecodedData = featuredEncodedData
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
              
              const featuredJsonData = JSON.parse(featuredDecodedData)
              const featuredRankingData = featuredJsonData?.data?.response?.$getTeibanRanking?.data
              
              if (featuredRankingData) {
                console.log(`✓ ランキング取得成功`)
                console.log(`  ラベル: ${featuredRankingData.label || '不明'}`)
                console.log(`  フィーチャーキー: ${featuredRankingData.featuredKey || '不明'}`)
                console.log(`  アイテム数: ${featuredRankingData.items?.length || 0}`)
                
                if (featuredRankingData.items && featuredRankingData.items.length > 0) {
                  console.log(`  上位3件:`)
                  featuredRankingData.items.slice(0, 3).forEach((item: any, index: number) => {
                    console.log(`    ${index + 1}位: ${item.title}`)
                  })
                  
                  // このランキングが本当に特定ジャンルのものかチェック
                  const isDifferent = featuredRankingData.items[0].title !== '梅雨入りと天使の梯子'
                  console.log(`  🎯 総合ランキングと異なる: ${isDifferent ? 'YES' : 'NO'}`)
                  
                  if (isDifferent) {
                    console.log(`\n📊 「${target.label}」の専用ランキング TOP 5:`)
                    featuredRankingData.items.slice(0, 5).forEach((item: any, index: number) => {
                      console.log(`${index + 1}位: ${item.title}`)
                      console.log(`  ID: ${item.id}, 再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
                    })
                  }
                }
              }
            }
            
          } catch (featuredError) {
            console.log(`✗ エラー: ${featuredError}`)
          }
          
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        
      } else {
        console.log(`✗ Featured Keys データが見つかりません`)
      }
      
    } else {
      console.log(`✗ meta tagが見つかりません`)
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
  
  console.log(`\n=== 結論 ===`)
  console.log(`1. 人気タグは $getTeibanRankingFeaturedKeys で取得可能`)
  console.log(`2. 各タグは featuredKey という独自IDを持つ`)
  console.log(`3. featuredKey を genre パラメータとして使用可能`)
  console.log(`4. スクリーンショットの人気タグとの一致度を確認`)
}

extractFeaturedKeys().catch(console.error)