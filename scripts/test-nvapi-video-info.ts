/**
 * NVAPI経由で動画情報（タグ含む）を取得するテスト
 */

async function testNvapiVideoInfo() {
  console.log('=== NVAPI 動画情報取得テスト ===\n')
  
  const testVideoIds = [
    'sm45081492', // 琴葉茜とユニティを自動化して無限にガチャを引くゲーム
    'sm45084617', // 琴葉茜の闇ゲー#197
    'sm27965309', // DECO*27 - ゴーストルール (古い動画)
  ]
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ja,en;q=0.9',
    'X-Frontend-Id': '6',
    'X-Frontend-Version': '0',
    'X-Niconico-Language': 'ja-jp',
    'Referer': 'https://www.nicovideo.jp/',
    'Origin': 'https://www.nicovideo.jp'
  }
  
  // 1. 個別動画情報API
  console.log('1. 個別動画情報API (/v1/watch/):')
  for (const videoId of testVideoIds) {
    try {
      const url = `https://nvapi.nicovideo.jp/v1/watch/${videoId}`
      console.log(`\n${videoId}:`)
      console.log(`  URL: ${url}`)
      
      const response = await fetch(url, { headers })
      console.log(`  ステータス: ${response.status}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log('  データ構造:', Object.keys(data).join(', '))
        
        // タグ情報を探す
        if (data.tag) {
          console.log('  タグ情報あり:', data.tag)
        }
        if (data.video?.tags) {
          console.log('  video.tags:', data.video.tags)
        }
        if (data.tags) {
          console.log('  tags:', data.tags)
        }
      }
    } catch (error) {
      console.log(`  エラー: ${error}`)
    }
  }
  
  // 2. 複数動画情報API
  console.log('\n\n2. 複数動画情報API (/v1/videos):')
  try {
    const url = `https://nvapi.nicovideo.jp/v1/videos?ids=${testVideoIds.join(',')}`
    console.log(`URL: ${url}`)
    
    const response = await fetch(url, { headers })
    console.log(`ステータス: ${response.status}`)
    
    if (response.ok) {
      const data = await response.json()
      console.log('データ構造:', Object.keys(data).join(', '))
      
      if (data.items || data.videos || data.data) {
        const items = data.items || data.videos || data.data
        console.log(`取得数: ${Array.isArray(items) ? items.length : 0}`)
      }
    }
  } catch (error) {
    console.log(`エラー: ${error}`)
  }
  
  // 3. v3 API（新しいバージョン）
  console.log('\n\n3. v3 API テスト:')
  for (const videoId of testVideoIds.slice(0, 1)) {
    try {
      const url = `https://nvapi.nicovideo.jp/v3/video.array?id=${videoId}`
      console.log(`\n${videoId}:`)
      console.log(`  URL: ${url}`)
      
      const response = await fetch(url, { headers })
      console.log(`  ステータス: ${response.status}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log('  データ構造:', Object.keys(data).join(', '))
        
        if (data.data && Array.isArray(data.data)) {
          const video = data.data[0]
          console.log('  動画情報キー:', Object.keys(video).join(', '))
          
          // タグ情報を探す
          if (video.tag) {
            console.log('  タグ情報:')
            console.log('    構造:', Object.keys(video.tag).join(', '))
            if (video.tag.items) {
              console.log(`    タグ数: ${video.tag.items.length}`)
              video.tag.items.slice(0, 5).forEach((tag: any) => {
                console.log(`    - ${tag.name || tag}`)
              })
            }
          }
        }
      }
    } catch (error) {
      console.log(`  エラー: ${error}`)
    }
  }
  
  // 4. エンドポイント探索
  console.log('\n\n4. その他のエンドポイント探索:')
  const endpoints = [
    `/v1/video/${testVideoIds[0]}/array`,
    `/v2/videos/${testVideoIds[0]}`,
    `/v1/videos/${testVideoIds[0]}/related`,
    `/v1/tag/video/${testVideoIds[0]}`,
    `/v1/video/metadata/${testVideoIds[0]}`,
  ]
  
  for (const endpoint of endpoints) {
    try {
      const url = `https://nvapi.nicovideo.jp${endpoint}`
      const response = await fetch(url, { headers })
      console.log(`${endpoint}: ${response.status}`)
    } catch (error) {
      console.log(`${endpoint}: エラー`)
    }
  }
}

// 実行
if (require.main === module) {
  testNvapiVideoInfo().catch(console.error)
}

export default testNvapiVideoInfo