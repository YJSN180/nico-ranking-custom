import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function testAPITagRanking() {
  console.log('🔧 APIエンドポイントでタグ別ランキングをテストします...\n')
  
  const baseUrl = 'https://nico-ranking-custom.vercel.app'
  const testCases = [
    // キャッシュされていないタグをテスト
    { tag: 'AIのべりすと', page: 1 },
    { tag: 'AIのべりすと', page: 2 },
    { tag: '変態糞親父', page: 1 },
    { tag: '変態糞親父', page: 2 },
  ]
  
  for (const testCase of testCases) {
    console.log(`📌 テスト: タグ「${testCase.tag}」ページ${testCase.page}`)
    
    try {
      const url = `${baseUrl}/api/ranking?genre=other&period=24h&tag=${encodeURIComponent(testCase.tag)}&page=${testCase.page}`
      console.log(`URL: ${url}`)
      
      const response = await fetch(url)
      
      if (!response.ok) {
        console.log(`❌ HTTPエラー: ${response.status} ${response.statusText}`)
        continue
      }
      
      const data = await response.json()
      
      // レスポンス形式を確認
      if (data.items && Array.isArray(data.items)) {
        console.log(`✅ 新形式: ${data.items.length}件`)
        console.log(`   hasMore: ${data.hasMore}`)
        console.log(`   totalCached: ${data.totalCached}`)
        
        if (data.items.length > 0) {
          console.log(`   最初: "${data.items[0].title}"`)
          console.log(`   最後: "${data.items[data.items.length - 1].title}"`)
        }
      } else if (Array.isArray(data)) {
        console.log(`✅ 旧形式: ${data.length}件`)
        if (data.length > 0) {
          console.log(`   最初: "${data[0].title}"`)
          console.log(`   最後: "${data[data.length - 1].title}"`)
        }
      } else {
        console.log(`❓ 不明な形式:`, Object.keys(data))
      }
      
    } catch (error) {
      console.log(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown'}`)
    }
    
    console.log()
  }
}

testAPITagRanking().catch(console.error)