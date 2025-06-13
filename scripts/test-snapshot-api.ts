/**
 * Snapshot APIのタグ取得テスト
 */

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

async function testSnapshotAPI() {
  console.log('=== Snapshot API タグ取得テスト ===\n')
  
  // 人気動画のIDをテスト
  const testVideoIds = ['sm45081492', 'sm45084617', 'sm45080414', 'sm45084221']
  
  for (const videoId of testVideoIds) {
    console.log(`\n${videoId} のタグ取得テスト:`)
    
    try {
      // 特定の動画IDで検索
      const params = new URLSearchParams({
        q: videoId,
        targets: 'title',
        fields: 'contentId,title,tags,categoryTags,viewCounter',
        _sort: '-viewCounter',
        _limit: '10'
      })
      
      const fullUrl = `${SNAPSHOT_API_URL}?${params}`
      console.log(`API URL: ${fullUrl}`)
      
      const response = await fetch(fullUrl, {
        headers: {
          'User-Agent': 'nico-ranking-app/1.0',
          'Accept': 'application/json'
        }
      })
      
      console.log(`ステータス: ${response.status}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log(`検索結果数: ${data.data?.length || 0}`)
        
        if (data.data && data.data.length > 0) {
          data.data.forEach((video: any, index: number) => {
            console.log(`  ${index + 1}. ${video.contentId}`)
            console.log(`     タイトル: ${video.title?.substring(0, 50)}...`)
            console.log(`     タグ: "${video.tags || 'なし'}"`)
            console.log(`     カテゴリタグ: "${video.categoryTags || 'なし'}"`)
            console.log(`     再生数: ${video.viewCounter || 0}`)
            
            if (video.tags) {
              const tagArray = video.tags.split(' ').filter((t: string) => t.length > 0)
              console.log(`     タグ配列: [${tagArray.join(', ')}] (${tagArray.length}件)`)
            }
          })
        } else {
          console.log('  検索結果なし')
        }
      } else {
        const errorText = await response.text()
        console.log(`  エラー: ${errorText}`)
      }
      
    } catch (error) {
      console.log(`  例外: ${error}`)
    }
    
    // レート制限対策
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  // 一般的な検索テスト
  console.log('\n=== 一般検索テスト ===')
  
  try {
    const params = new URLSearchParams({
      q: '*',
      targets: 'title',
      fields: 'contentId,title,tags,categoryTags,viewCounter',
      _sort: '-viewCounter',
      _limit: '5'
    })
    
    const fullUrl = `${SNAPSHOT_API_URL}?${params}`
    console.log(`一般検索URL: ${fullUrl}`)
    
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'nico-ranking-app/1.0',
        'Accept': 'application/json'
      }
    })
    
    console.log(`一般検索ステータス: ${response.status}`)
    
    if (response.ok) {
      const data = await response.json()
      console.log(`一般検索結果数: ${data.data?.length || 0}`)
      
      if (data.data && data.data.length > 0) {
        data.data.slice(0, 3).forEach((video: any, index: number) => {
          console.log(`  ${index + 1}. ${video.contentId} - ${video.title?.substring(0, 30)}...`)
          if (video.tags) {
            const tagArray = video.tags.split(' ').filter((t: string) => t.length > 0)
            console.log(`     タグ: [${tagArray.slice(0, 5).join(', ')}] (${tagArray.length}件)`)
          }
        })
      }
    }
    
  } catch (error) {
    console.log(`一般検索例外: ${error}`)
  }
}

// 実行
if (require.main === module) {
  testSnapshotAPI().catch(console.error)
}

export default testSnapshotAPI