/**
 * 本番環境のデータ構造を確認（API経由）
 */

async function checkProductionData() {
  console.log('=== 本番環境データ構造確認 ===\n')
  
  const baseUrl = 'https://nico-ranking-custom-yjsns-projects.vercel.app'
  
  try {
    // 1. 基本的なランキングデータの構造確認
    console.log('1. 基本ランキングデータ構造:')
    
    const genres = ['all', 'game', 'other']
    const periods = ['24h', 'hour']
    
    for (const genre of genres) {
      for (const period of periods) {
        console.log(`\n${genre}ジャンル (${period}):`)
        
        const url = `${baseUrl}/api/ranking?genre=${genre}&period=${period}`
        const response = await fetch(url)
        
        if (response.ok) {
          const data = await response.json()
          
          console.log(`  - ステータス: ✅ ${response.status}`)
          console.log(`  - アイテム数: ${data.items?.length || 0}`)
          console.log(`  - 人気タグ数: ${data.popularTags?.length || 0}`)
          
          if (data.metadata) {
            console.log(`  - 更新日時: ${data.metadata.updatedAt || 'なし'}`)
            console.log(`  - バージョン: ${data.metadata.version || 'なし'}`)
          }
          
          // データ構造の例を表示
          if (data.items && data.items.length > 0) {
            const firstItem = data.items[0]
            console.log('  - データ構造例:')
            console.log(`    * ID: ${firstItem.id}`)
            console.log(`    * タイトル: ${firstItem.title?.substring(0, 30)}...`)
            console.log(`    * 投稿者: ${firstItem.authorName || 'なし'}`)
            console.log(`    * 再生数: ${firstItem.views}`)
            console.log(`    * タグ数: ${firstItem.tags?.length || 0}`)
          }
          
        } else {
          console.log(`  - ステータス: ❌ ${response.status}`)
        }
      }
    }
    
    // 2. NGリスト機能の確認
    console.log('\n\n2. NGリスト機能確認:')
    
    try {
      const ngUrl = `${baseUrl}/api/admin/ng-list`
      const ngResponse = await fetch(ngUrl, {
        method: 'GET'
      })
      
      console.log(`NGリストAPI: ${ngResponse.status}`)
      
      if (ngResponse.ok) {
        const ngData = await ngResponse.json()
        console.log('✅ NGリストAPI応答成功')
        console.log(`- 動画ID数: ${ngData.videoIds?.length || 0}`)
        console.log(`- 動画タイトル数: ${ngData.videoTitles?.length || 0}`)
        console.log(`- 投稿者ID数: ${ngData.authorIds?.length || 0}`)
        console.log(`- 投稿者名数: ${ngData.authorNames?.length || 0}`)
        console.log(`- 派生動画ID数: ${ngData.derivedVideoIds?.length || 0}`)
      } else {
        console.log('❌ NGリストAPI認証が必要または無効')
      }
    } catch (ngError) {
      console.log('NGリスト確認エラー:', ngError)
    }
    
    // 3. キャッシュヘッダーの確認
    console.log('\n3. キャッシュヘッダー確認:')
    
    const cacheTestUrl = `${baseUrl}/api/ranking?genre=all&period=24h`
    const cacheResponse = await fetch(cacheTestUrl)
    
    console.log('Cache-Control:', cacheResponse.headers.get('cache-control'))
    console.log('X-Data-Source:', cacheResponse.headers.get('x-data-source'))
    console.log('Last-Modified:', cacheResponse.headers.get('last-modified'))
    
  } catch (error) {
    console.error('確認エラー:', error)
  }
}

// 実行
if (require.main === module) {
  checkProductionData().catch(console.error)
}

export default checkProductionData