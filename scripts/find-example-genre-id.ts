#!/usr/bin/env tsx

// 「例のソレ」ジャンルの正しいIDを特定

async function findExampleGenreId() {
  console.log('=== 「例のソレ」ジャンルの正しいID特定 ===')
  
  // 既知のジャンルIDから推測
  const knownGenreIds = [
    'ramuboyn', // その他（既知）
    'reinosore', // 例のソレ（推測）
    'example',
    'leisure',
    'hobby',
    'misc',
    'etc',
    'sore',
    'rei'
  ]
  
  // 「例のアレ」タグでテストして、実際にタグが設定されるIDを探す
  const testTag = '例のアレ'
  
  for (const genreId of knownGenreIds) {
    console.log(`\n--- ${genreId} をテスト中 ---`)
    
    const testUrl = `https://www.nicovideo.jp/ranking/genre/${genreId}?tag=${encodeURIComponent(testTag)}`
    
    try {
      const response = await fetch('http://localhost:8888/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-key',
        },
        body: JSON.stringify({
          url: testUrl,
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
      
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      if (metaMatch) {
        const encodedData = metaMatch[1]!
        const decodedData = encodedData
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
        
        const jsonData = JSON.parse(decodedData)
        const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
        
        if (rankingData) {
          console.log(`✓ レスポンス取得成功`)
          console.log(`  ラベル: ${rankingData.label || '不明'}`)
          console.log(`  タグ設定: ${rankingData.tag || 'なし'}`)
          console.log(`  アイテム数: ${rankingData.items?.length || 0}`)
          
          if (rankingData.items && rankingData.items.length > 0) {
            console.log(`  1位: ${rankingData.items[0].title}`)
          }
          
          // タグが正しく設定されているかチェック
          const hasCorrectTag = rankingData.tag === testTag
          console.log(`  🎯 正しいタグ設定: ${hasCorrectTag ? 'YES' : 'NO'}`)
          
          if (hasCorrectTag) {
            console.log(`\n🎉 発見！「例のソレ」ジャンルの正しいID: ${genreId}`)
            
            // このIDで他のタグもテスト
            console.log('\n--- 他のタグでも検証 ---')
            const otherTags = ['クッキー☆', 'BB先輩シリーズ']
            
            for (const otherTag of otherTags) {
              const otherUrl = `https://www.nicovideo.jp/ranking/genre/${genreId}?tag=${encodeURIComponent(otherTag)}`
              
              try {
                const otherResponse = await fetch('http://localhost:8888/', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': 'test-key',
                  },
                  body: JSON.stringify({
                    url: otherUrl,
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                      'Accept': 'text/html,application/xhtml+xml',
                      'Accept-Language': 'ja',
                      'Cookie': 'sensitive_material_status=accept',
                    }
                  }),
                })

                const otherProxyData = await otherResponse.json()
                const otherHtml = otherProxyData.body
                
                const otherMetaMatch = otherHtml.match(/<meta name="server-response" content="([^"]+)"/)
                if (otherMetaMatch) {
                  const otherEncodedData = otherMetaMatch[1]!
                  const otherDecodedData = otherEncodedData
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                  
                  const otherJsonData = JSON.parse(otherDecodedData)
                  const otherRankingData = otherJsonData?.data?.response?.$getTeibanRanking?.data
                  
                  console.log(`  "${otherTag}": タグ設定=${otherRankingData?.tag || 'なし'}`)
                }
                
              } catch (otherError) {
                console.log(`  "${otherTag}": エラー`)
              }
              
              await new Promise(resolve => setTimeout(resolve, 200))
            }
            
            return genreId
          }
        }
      }
      
    } catch (error) {
      console.log(`✗ エラー: ${error}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  
  console.log('\n⚠️ 「例のソレ」ジャンルの正しいIDが見つかりませんでした')
  console.log('可能性:')
  console.log('1. 「例のソレ」は独立したジャンルではない')
  console.log('2. タグ機能が「その他」ジャンルでのみ有効')
  console.log('3. 異なるAPI構造を使用している')
  
  return null
}

findExampleGenreId().catch(console.error)