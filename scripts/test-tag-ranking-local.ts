import dotenv from 'dotenv'
import path from 'path'
import { scrapeRankingPage } from '../lib/scraper'
import { filterRankingData } from '../lib/ng-filter'

// .env.localを読み込む
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function testTagRankingLocal() {
  console.log('=== ローカルでタグ別ランキングのNGフィルタリングテスト ===\n')
  
  try {
    // インタビューシリーズのランキングを取得
    const genre = 'other'
    const period = '24h' as const
    const tag = 'インタビューシリーズ'
    
    console.log(`${genre}ジャンルの「${tag}」タグランキングを取得中...`)
    const { items } = await scrapeRankingPage(genre, period, tag)
    
    console.log(`\n取得したアイテム数: ${items.length}件`)
    
    // NGリストの投稿者をチェック
    const ngAuthors = ['蠍媛', 'ゴMNT', '地雷姫', 'ほまリニスト', 'ぱぱら快刀', 'くりうくろう']
    const foundBefore = items.filter(item => 
      item.authorName && ngAuthors.includes(item.authorName)
    )
    
    if (foundBefore.length > 0) {
      console.log(`\n⚠️  フィルタリング前: NGリストの投稿者が${foundBefore.length}件含まれています`)
      foundBefore.forEach(item => {
        console.log(`  - 「${item.title}」 by ${item.authorName}`)
      })
    } else {
      console.log('\nフィルタリング前: NGリストの投稿者は含まれていません')
    }
    
    // NGフィルタリングを適用
    const { items: filtered } = await filterRankingData({ items: items as any })
    
    console.log(`\nフィルタリング後: ${filtered.length}件`)
    
    const foundAfter = filtered.filter(item => 
      item.authorName && ngAuthors.includes(item.authorName)
    )
    
    if (foundAfter.length > 0) {
      console.log(`\n❌ フィルタリング後: NGリストの投稿者がまだ${foundAfter.length}件含まれています！`)
      foundAfter.forEach(item => {
        console.log(`  - 「${item.title}」 by ${item.authorName}`)
      })
    } else {
      console.log('\n✅ フィルタリング後: NGリストの投稿者は完全に除外されました')
    }
    
    console.log(`\n削除されたアイテム数: ${items.length - filtered.length}件`)
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

testTagRankingLocal().catch(console.error)