import { fetchRanking } from '../lib/complete-hybrid-scraper'

async function test300ItemsRetrieval() {
  console.log('=== 300件取得テスト開始 ===\n')
  
  const testCases = [
    { genre: 'all', tag: null, label: '総合ランキング' },
    { genre: 'game', tag: 'ゲーム', label: 'ゲームジャンル - ゲームタグ' },
    { genre: 'music', tag: 'VOCALOID', label: '音楽ジャンル - VOCALOIDタグ' },
    { genre: 'other', tag: 'MMD', label: 'その他ジャンル - MMDタグ' }
  ]
  
  for (const test of testCases) {
    console.log(`\n--- ${test.label} ---`)
    
    try {
      // 300件取得を試みる
      const result = await fetchRanking(
        test.genre,
        test.tag,
        '24h',
        300  // 300件リクエスト
      )
      
      console.log(`取得件数: ${result.items.length}件`)
      console.log(`人気タグ: ${result.popularTags?.slice(0, 5).join(', ') || 'なし'}`)
      
      if (result.items.length > 100) {
        console.log('✅ 100件以上取得成功！')
        console.log(`  1位: ${result.items[0]?.title}`)
        console.log(`  100位: ${result.items[99]?.title}`)
        console.log(`  101位: ${result.items[100]?.title || 'なし'}`)
        console.log(`  200位: ${result.items[199]?.title || 'なし'}`)
        console.log(`  最後: ${result.items[result.items.length - 1]?.title}`)
      } else {
        console.log('❌ 100件以下しか取得できませんでした')
      }
      
    } catch (error) {
      console.error(`エラー: ${error}`)
    }
  }
  
  // APIエンドポイント経由でも確認
  console.log('\n\n=== APIエンドポイント経由のテスト ===')
  
  try {
    const response = await fetch('http://localhost:3000/api/ranking?genre=all&period=24h')
    const data = await response.json()
    
    console.log(`APIレスポンス:`)
    console.log(`- items配列の長さ: ${data.items?.length || 0}件`)
    console.log(`- 人気タグ数: ${data.popularTags?.length || 0}個`)
    
    if (data.items && data.items.length > 100) {
      console.log('✅ APIでも100件以上取得！')
    }
  } catch (error) {
    console.error('APIテストエラー:', error)
  }
}

test300ItemsRetrieval().catch(console.error)