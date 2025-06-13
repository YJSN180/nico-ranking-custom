/**
 * Snapshot APIのクエリ形式をテスト
 */

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

async function testSnapshotQuery() {
  console.log('=== Snapshot API クエリ形式テスト ===\n')
  
  const testVideoId = 'sm27965309' // DECO*27 - ゴーストルール
  
  // 1. contentId:形式でのクエリ
  console.log('1. contentId:形式でのクエリテスト')
  try {
    const params1 = new URLSearchParams({
      q: `contentId:${testVideoId}`,
      targets: 'title',
      fields: 'contentId,title,tags,viewCounter',
      _limit: '10'
    })
    
    const response1 = await fetch(`${SNAPSHOT_API_URL}?${params1}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/json'
      }
    })
    
    console.log(`ステータス: ${response1.status}`)
    const data1 = await response1.json()
    console.log(`結果数: ${data1.data?.length || 0}`)
    if (data1.data?.length > 0) {
      console.log('データ:', JSON.stringify(data1.data[0], null, 2))
    }
  } catch (error) {
    console.log('エラー:', error)
  }
  
  // 2. contentId単体でのクエリ
  console.log('\n2. contentId単体でのクエリテスト')
  try {
    const params2 = new URLSearchParams({
      q: testVideoId,
      targets: 'contentId',
      fields: 'contentId,title,tags,viewCounter',
      _limit: '10'
    })
    
    const response2 = await fetch(`${SNAPSHOT_API_URL}?${params2}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/json'
      }
    })
    
    console.log(`ステータス: ${response2.status}`)
    if (response2.status === 400) {
      const errorText = await response2.text()
      console.log('エラー内容:', errorText)
    } else {
      const data2 = await response2.json()
      console.log(`結果数: ${data2.data?.length || 0}`)
    }
  } catch (error) {
    console.log('エラー:', error)
  }
  
  // 3. タイトルでのクエリ
  console.log('\n3. タイトルでのクエリテスト')
  try {
    const params3 = new URLSearchParams({
      q: 'ゴーストルール',
      targets: 'title',
      fields: 'contentId,title,tags,viewCounter',
      _limit: '10'
    })
    
    const response3 = await fetch(`${SNAPSHOT_API_URL}?${params3}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/json'
      }
    })
    
    console.log(`ステータス: ${response3.status}`)
    const data3 = await response3.json()
    console.log(`結果数: ${data3.data?.length || 0}`)
    if (data3.data?.length > 0) {
      data3.data.forEach((item: any, i: number) => {
        console.log(`${i+1}. ${item.contentId}: ${item.title}`)
        console.log(`   タグ: ${item.tags || 'なし'}`)
      })
    }
  } catch (error) {
    console.log('エラー:', error)
  }
  
  // 4. フィルターでのクエリ
  console.log('\n4. フィルターでのクエリテスト')
  try {
    const params4 = new URLSearchParams({
      q: '',
      targets: 'title',
      fields: 'contentId,title,tags,viewCounter',
      filters: `contentId:${testVideoId}`,
      _limit: '10'
    })
    
    const response4 = await fetch(`${SNAPSHOT_API_URL}?${params4}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/json'
      }
    })
    
    console.log(`ステータス: ${response4.status}`)
    const data4 = await response4.json()
    console.log(`結果数: ${data4.data?.length || 0}`)
  } catch (error) {
    console.log('エラー:', error)
  }
}

// 実行
if (require.main === module) {
  testSnapshotQuery().catch(console.error)
}

export default testSnapshotQuery