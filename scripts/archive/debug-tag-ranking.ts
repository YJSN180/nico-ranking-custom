#!/usr/bin/env tsx

// タグ付きランキングの動作を詳細デバッグ

async function debugTagRanking() {
  console.log('=== タグ付きランキングのデバッグ ===')
  
  const testCases = [
    {
      genre: 'other',
      term: '24h',
      tag: undefined,
      name: '総合24時間（タグなし）'
    },
    {
      genre: 'other', 
      term: '24h',
      tag: 'BB先輩シリーズ',
      name: 'その他24時間（BB先輩シリーズタグ）'
    },
    {
      genre: 'all',
      term: '24h', 
      tag: 'ゲーム',
      name: '総合24時間（ゲームタグ）'
    }
  ]
  
  for (const testCase of testCases) {
    console.log(`\n=== ${testCase.name} ===`)
    
    // URLを構築
    let url = `https://www.nicovideo.jp/ranking/genre/${testCase.genre}?term=${testCase.term}`
    if (testCase.tag) {
      url += `&tag=${encodeURIComponent(testCase.tag)}`
    }
    
    console.log(`リクエストURL: ${url}`)
    
    try {
      // プロキシ経由でHTMLを取得
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
        console.log(`✗ プロキシエラー: ${response.status}`)
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
          
          // ランキングデータの確認
          const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
          if (rankingData) {
            console.log(`✓ ランキングデータ取得成功`)
            console.log(`  ジャンル: ${rankingData.featuredKey || '不明'}`)
            console.log(`  ラベル: ${rankingData.label || '不明'}`)
            console.log(`  タグ: ${rankingData.tag || 'なし'}`)
            console.log(`  アイテム数: ${rankingData.items?.length || 0}`)
            
            if (rankingData.items && rankingData.items.length > 0) {
              console.log(`  1位: ${rankingData.items[0].title}`)
              console.log(`  2位: ${rankingData.items[1]?.title || 'なし'}`)
              console.log(`  3位: ${rankingData.items[2]?.title || 'なし'}`)
              
              // タグ関連性の確認
              if (testCase.tag) {
                const tagMatches = rankingData.items.filter((item: any) => 
                  item.title?.includes(testCase.tag) ||
                  item.title?.includes('BB') ||
                  item.title?.includes('先輩') ||
                  item.title?.includes('淫夢')
                ).length
                console.log(`  タグ関連動画数: ${tagMatches}/${rankingData.items.length}`)
              }
            }
            
            // レスポンス構造の詳細確認
            console.log(`\nレスポンス構造の詳細:`)
            if (jsonData.data?.response) {
              const responseKeys = Object.keys(jsonData.data.response)
              console.log(`  Response keys: ${responseKeys.join(', ')}`)
              
              // タグ関連のデータ構造を確認
              responseKeys.forEach(key => {
                if (key.includes('Tag') || key.includes('tag')) {
                  console.log(`  ${key}:`, Object.keys(jsonData.data.response[key]))
                }
              })
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
      
      // HTMLでのタグ検索
      const tagInTitle = html.includes(`tag=${encodeURIComponent(testCase.tag || '')}`)
      const tagInUrl = html.includes(testCase.tag || '')
      console.log(`HTMLでタグ検出: URL=${tagInTitle}, テキスト=${tagInUrl}`)
      
    } catch (error) {
      console.log(`✗ エラー: ${error}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

debugTagRanking().catch(console.error)