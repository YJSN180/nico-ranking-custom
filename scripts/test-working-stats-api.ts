/**
 * 現在動作している統計情報取得方法を詳しく調査
 */

async function testWorkingStatsAPI() {
  console.log('=== 動作している統計情報取得方法の調査 ===\n')
  
  // テスト用動画ID
  const testVideoIds = [
    'sm45081492', // 新しい動画
    'sm27965309', // 古い動画（DECO*27）
  ]
  
  // 1. 現在の実装を再現
  console.log('1. 現在の実装（lib/snapshot-api.ts）を再現:')
  const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'
  
  const query = testVideoIds.map(id => `contentId:${id}`).join(' OR ')
  const params = new URLSearchParams({
    q: query,
    targets: 'title', // titleフィールドで検索
    fields: 'contentId,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
    _limit: String(testVideoIds.length)
  })
  
  const url = `${SNAPSHOT_API_URL}?${params}`
  console.log(`URL: ${url}`)
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/json',
        'Accept-Language': 'ja'
      }
    })
    
    console.log(`ステータス: ${response.status}`)
    
    if (response.ok) {
      const data = await response.json()
      console.log(`結果数: ${data.data?.length || 0}`)
      
      if (data.data && data.data.length > 0) {
        data.data.forEach((video: any) => {
          console.log(`\n${video.contentId}:`)
          console.log(`  タイトル: ${video.title?.substring(0, 30)}...`)
          console.log(`  再生数: ${video.viewCounter}`)
          console.log(`  タグ: ${video.tags || 'なし'}`)
        })
      }
    }
  } catch (error) {
    console.log(`エラー: ${error}`)
  }
  
  // 2. contentIdフィルターを使う方法
  console.log('\n\n2. contentIdフィルターを使う方法:')
  try {
    const params2 = new URLSearchParams({
      q: '*',
      targets: 'title',
      fields: 'contentId,title,tags,viewCounter',
      _limit: '10'
    })
    
    // フィルターを追加
    testVideoIds.forEach((id, index) => {
      params2.append(`filters[contentId][${index}]`, id)
    })
    
    const url2 = `${SNAPSHOT_API_URL}?${params2}`
    console.log(`URL: ${url2}`)
    
    const response2 = await fetch(url2, {
      headers: {
        'User-Agent': 'nico-ranking-app/1.0',
        'Accept': 'application/json'
      }
    })
    
    console.log(`ステータス: ${response2.status}`)
    
    if (response2.ok) {
      const data2 = await response2.json()
      console.log(`結果数: ${data2.data?.length || 0}`)
    }
  } catch (error) {
    console.log(`エラー: ${error}`)
  }
  
  // 3. 単純なタイトル検索
  console.log('\n\n3. 動作確認用の単純なタイトル検索:')
  try {
    const params3 = new URLSearchParams({
      q: 'VOCALOID',
      targets: 'tags',
      fields: 'contentId,title,tags,viewCounter',
      _sort: '-viewCounter',
      _limit: '3'
    })
    
    const url3 = `${SNAPSHOT_API_URL}?${params3}`
    console.log(`URL: ${url3}`)
    
    const response3 = await fetch(url3, {
      headers: {
        'User-Agent': 'nico-ranking-app/1.0',
        'Accept': 'application/json'
      }
    })
    
    console.log(`ステータス: ${response3.status}`)
    
    if (response3.ok) {
      const data3 = await response3.json()
      console.log(`結果数: ${data3.data?.length || 0}`)
      
      if (data3.data && data3.data.length > 0) {
        data3.data.forEach((video: any) => {
          console.log(`\n${video.contentId}:`)
          console.log(`  タイトル: ${video.title?.substring(0, 30)}...`)
          console.log(`  タグ: ${video.tags ? (typeof video.tags === 'string' ? video.tags : JSON.stringify(video.tags)) : 'なし'}`)
        })
      }
    }
  } catch (error) {
    console.log(`エラー: ${error}`)
  }
  
  // 4. 実際のHTMLから動画IDを確認
  console.log('\n\n4. ランキングページの実際の動画IDを確認:')
  try {
    const rankingUrl = 'https://www.nicovideo.jp/ranking/genre/all?term=24h'
    const rankingResponse = await fetch(rankingUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html',
        'Accept-Language': 'ja'
      }
    })
    
    if (rankingResponse.ok) {
      const html = await rankingResponse.text()
      
      // server-responseメタタグを探す
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      if (metaMatch) {
        const encodedData = metaMatch[1]
        const decodedData = encodedData
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
        
        const serverData = JSON.parse(decodedData)
        const items = serverData.data?.response?.$getTeibanRanking?.data?.items || []
        
        console.log(`ランキングアイテム数: ${items.length}`)
        if (items.length > 0) {
          console.log('最初のアイテムの構造:')
          const firstItem = items[0]
          console.log('  キー:', Object.keys(firstItem).join(', '))
          console.log('  tags:', firstItem.tags)
          console.log('  tag:', firstItem.tag)
        }
      }
    }
  } catch (error) {
    console.log(`エラー: ${error}`)
  }
}

// 実行
if (require.main === module) {
  testWorkingStatsAPI().catch(console.error)
}

export default testWorkingStatsAPI