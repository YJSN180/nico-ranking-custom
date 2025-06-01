#!/usr/bin/env tsx

// 発見されたnvapiエンドポイントをテスト

async function testNvapiEndpoints() {
  console.log('=== nvapi エンドポイントのテスト ===')
  
  const genreId = 'd2um7mc4' // 例のソレ
  
  // 1. フレーム情報（人気タグ）API
  console.log('\n=== 1. フレーム情報API（人気タグ） ===')
  const framesUrl = `https://nvapi.nicovideo.jp/v1/ranking/teiban/${genreId}/frames?frameIds=95%2C96`
  console.log(`URL: ${framesUrl}`)
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: framesUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'ja',
          'Referer': `https://www.nicovideo.jp/ranking/genre/${genreId}?term=24h`,
          'Cookie': 'sensitive_material_status=accept; user_id=42228234; is_premium=true',
        }
      }),
    })

    const proxyData = await response.json()
    
    if (proxyData.statusCode === 200) {
      console.log('✓ フレーム情報API成功')
      
      try {
        const frameData = JSON.parse(proxyData.body)
        console.log('レスポンス構造:', Object.keys(frameData))
        
        if (frameData.data) {
          console.log('data構造:', Object.keys(frameData.data))
          
          // フレーム情報を詳細表示
          if (frameData.data.frames) {
            console.log(`\nフレーム数: ${frameData.data.frames.length}`)
            frameData.data.frames.forEach((frame: any, index: number) => {
              console.log(`\nフレーム${index + 1}:`)
              console.log(`  ID: ${frame.id}`)
              console.log(`  ラベル: ${frame.label || '不明'}`)
              console.log(`  タイプ: ${frame.type || '不明'}`)
              console.log(`  説明: ${frame.description || '不明'}`)
              
              if (frame.items) {
                console.log(`  アイテム数: ${frame.items.length}`)
                frame.items.slice(0, 5).forEach((item: any, itemIndex: number) => {
                  console.log(`    ${itemIndex + 1}. ${item.label || item.name || item.title || 'ラベルなし'}`)
                })
              }
              
              if (frame.tags) {
                console.log(`  タグ数: ${frame.tags.length}`)
                frame.tags.slice(0, 10).forEach((tag: any, tagIndex: number) => {
                  console.log(`    タグ${tagIndex + 1}: ${tag.name || tag.label || tag}`)
                })
              }
            })
          }
          
          // その他の重要なデータ
          Object.keys(frameData.data).forEach(key => {
            if (key !== 'frames' && frameData.data[key]) {
              console.log(`\n${key}:`, JSON.stringify(frameData.data[key], null, 2).substring(0, 200))
            }
          })
        }
        
      } catch (parseError) {
        console.log('JSON解析エラー:', parseError)
        console.log('生データ:', proxyData.body.substring(0, 500))
      }
      
    } else {
      console.log(`✗ フレーム情報API失敗: ${proxyData.statusCode}`)
      console.log('エラー:', proxyData.body)
    }
    
  } catch (error) {
    console.error('フレーム情報APIエラー:', error)
  }
  
  // 2. ランキングデータAPI
  console.log('\n=== 2. ランキングデータAPI ===')
  const rankingUrl = `https://nvapi.nicovideo.jp/v1/ranking/teiban/${genreId}?term=24h&page=1&pageSize=100`
  console.log(`URL: ${rankingUrl}`)
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: rankingUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'ja',
          'Referer': `https://www.nicovideo.jp/ranking/genre/${genreId}?term=24h`,
          'Cookie': 'sensitive_material_status=accept; user_id=42228234; is_premium=true',
        }
      }),
    })

    const proxyData = await response.json()
    
    if (proxyData.statusCode === 200) {
      console.log('✓ ランキングAPI成功')
      
      try {
        const rankingData = JSON.parse(proxyData.body)
        console.log('レスポンス構造:', Object.keys(rankingData))
        
        if (rankingData.data) {
          console.log('data構造:', Object.keys(rankingData.data))
          
          if (rankingData.data.items) {
            console.log(`\n動画数: ${rankingData.data.items.length}`)
            console.log('\n上位10動画:')
            rankingData.data.items.slice(0, 10).forEach((item: any, index: number) => {
              console.log(`${index + 1}位: ${item.title}`)
              console.log(`  ID: ${item.id}`)
              console.log(`  再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
              
              // タグ情報があるかチェック
              if (item.tags) {
                const tagNames = item.tags.map((tag: any) => tag.name || tag).slice(0, 3)
                console.log(`  タグ: ${tagNames.join(', ')}`)
              }
            })
          }
          
          // ジャンル情報
          if (rankingData.data.genre) {
            console.log(`\nジャンル情報:`)
            console.log(`  ID: ${rankingData.data.genre.id}`)
            console.log(`  名前: ${rankingData.data.genre.name}`)
            console.log(`  ラベル: ${rankingData.data.genre.label}`)
          }
        }
        
      } catch (parseError) {
        console.log('JSON解析エラー:', parseError)
        console.log('生データ:', proxyData.body.substring(0, 500))
      }
      
    } else {
      console.log(`✗ ランキングAPI失敗: ${proxyData.statusCode}`)
      console.log('エラー:', proxyData.body)
    }
    
  } catch (error) {
    console.error('ランキングAPIエラー:', error)
  }
  
  // 3. 他のframeIDsもテスト
  console.log('\n=== 3. 他のフレームIDテスト ===')
  
  const testFrameIds = [
    '95,96',
    '1,2,3',
    '100,101',
    'all'
  ]
  
  for (const frameIds of testFrameIds) {
    console.log(`\n--- フレームID: ${frameIds} ---`)
    const testUrl = `https://nvapi.nicovideo.jp/v1/ranking/teiban/${genreId}/frames?frameIds=${encodeURIComponent(frameIds)}`
    
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
            'Accept': 'application/json',
            'Accept-Language': 'ja',
            'Referer': `https://www.nicovideo.jp/ranking/genre/${genreId}?term=24h`,
            'Cookie': 'sensitive_material_status=accept',
          }
        }),
      })

      const proxyData = await response.json()
      
      if (proxyData.statusCode === 200) {
        try {
          const data = JSON.parse(proxyData.body)
          if (data.data?.frames) {
            console.log(`✓ ${frameIds}: ${data.data.frames.length}フレーム取得`)
          } else {
            console.log(`△ ${frameIds}: データ構造が異なる`)
          }
        } catch {
          console.log(`✗ ${frameIds}: JSON解析失敗`)
        }
      } else {
        console.log(`✗ ${frameIds}: HTTP ${proxyData.statusCode}`)
      }
      
    } catch (error) {
      console.log(`✗ ${frameIds}: ${error}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  
  console.log('\n=== 結論 ===')
  console.log('1. nvapi エンドポイントが人気タグとランキングデータの真の取得元')
  console.log('2. frameIds=95,96 が人気タグボタン情報の可能性')
  console.log('3. これらのAPIを使えば正確なデータ取得が可能')
  console.log('4. プロキシサーバーでこれらのAPIも対応する必要がある')
}

testNvapiEndpoints().catch(console.error)