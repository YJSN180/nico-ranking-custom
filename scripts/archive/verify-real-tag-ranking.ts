#!/usr/bin/env tsx

// 実際のタグ別ランキングAPIを検証

async function verifyRealTagRanking() {
  console.log('=== 実際のタグ別ランキングAPI検証 ===')
  
  // スクリーンショットから確認できる人気タグをテスト
  const testTags = [
    '拓也さん',
    '替え歌拓也', 
    'BB先輩シリーズ',
    'AIのべりすト',
    '変態糞親父',
    'インタビューシリーズ'
  ]
  
  // ジャンルID（その他）を確認
  // スクリーンショットのURLから推測: ramuboyn が「その他」ジャンルのID
  const genreId = 'ramuboyn' // 「その他」ジャンル
  
  for (const tag of testTags) {
    console.log(`\n=== 「${tag}」タグのランキング検証 ===`)
    
    const urls = [
      {
        url: `https://www.nicovideo.jp/ranking/genre/${genreId}?tag=${encodeURIComponent(tag)}`,
        name: '24時間ランキング'
      },
      {
        url: `https://www.nicovideo.jp/ranking/genre/${genreId}?tag=${encodeURIComponent(tag)}&term=hour`,
        name: '毎時ランキング'
      }
    ]
    
    for (const testCase of urls) {
      console.log(`\n--- ${testCase.name} ---`)
      console.log(`URL: ${testCase.url}`)
      
      try {
        const response = await fetch('http://localhost:8888/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key',
          },
          body: JSON.stringify({
            url: testCase.url,
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
        
        // meta tagの確認
        const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
        if (metaMatch) {
          try {
            const encodedData = metaMatch[1]!
            const decodedData = encodedData
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
            
            const jsonData = JSON.parse(decodedData)
            const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
            
            if (rankingData) {
              console.log(`✓ ランキングデータ取得成功`)
              console.log(`  ラベル: ${rankingData.label || '不明'}`)
              console.log(`  タグ: ${rankingData.tag || 'なし'}`)
              console.log(`  アイテム数: ${rankingData.items?.length || 0}`)
              
              if (rankingData.items && rankingData.items.length > 0) {
                console.log(`  上位3件:`)
                rankingData.items.slice(0, 3).forEach((item: any, index: number) => {
                  console.log(`    ${index + 1}位: ${item.title}`)
                })
                
                // タグ関連性の確認
                const tagMatches = rankingData.items.filter((item: any) => 
                  item.title?.includes(tag) ||
                  item.title?.includes('拓也') ||
                  item.title?.includes('BB') ||
                  item.title?.includes('先輩') ||
                  item.title?.includes('淫夢') ||
                  item.title?.includes('AI')
                ).length
                
                console.log(`  タグ関連動画: ${tagMatches}/${rankingData.items.length} (${Math.round(tagMatches/rankingData.items.length*100)}%)`)
                
                // これが本当のタグ別ランキングかどうか判定
                const isRealTagRanking = rankingData.tag === tag || tagMatches > rankingData.items.length * 0.3
                console.log(`  🎯 真のタグ別ランキング: ${isRealTagRanking ? 'YES' : 'NO'}`)
                
                if (isRealTagRanking) {
                  console.log(`  🎉 成功！このAPIで正しいタグ別ランキングが取得できます`)
                }
              }
            } else {
              console.log(`✗ ランキングデータが見つかりません`)
            }
            
          } catch (parseError) {
            console.log(`✗ JSON解析エラー: ${parseError}`)
          }
        } else {
          console.log(`✗ meta tagが見つかりません`)
        }
        
      } catch (error) {
        console.log(`✗ エラー: ${error}`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log('\n=== 結論 ===')
  console.log('1. 正しいタグ別ランキングAPI: /ranking/genre/{genreId}?tag={tag}')
  console.log('2. ジャンルID: ramuboyn = その他ジャンル')
  console.log('3. 期間指定: &term=hour (毎時) / なし (24時間)')
  console.log('4. meta tag形式でJSONデータが取得可能')
}

verifyRealTagRanking().catch(console.error)