import dotenv from 'dotenv'
import path from 'path'
import { scrapeRankingPage } from '../lib/scraper'
import { filterRankingData } from '../lib/ng-filter'

// .env.localを読み込む
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function testTagPaginationDirect() {
  console.log('=== タグ別ランキングのページネーション直接テスト ===\n')
  
  const genre = 'other'
  const period = '24h' as const
  const tag = 'インタビューシリーズ'
  const limit = 100
  
  try {
    // ページ1を取得
    console.log('ページ1を取得中...')
    const { items: page1Items } = await scrapeRankingPage(genre, period, tag, limit, 1)
    
    // NGフィルタリングを適用
    const { items: filtered1 } = await filterRankingData({ items: page1Items as any })
    
    console.log(`\nページ1結果:`)
    console.log(`  取得: ${page1Items.length}件`)
    console.log(`  フィルタリング後: ${filtered1.length}件`)
    if (filtered1.length > 0) {
      console.log(`  1件目: ${filtered1[0].title}`)
      console.log(`  最後: ${filtered1[filtered1.length - 1].title}`)
    }
    
    // ページ2を取得
    console.log('\nページ2を取得中...')
    const { items: page2Items } = await scrapeRankingPage(genre, period, tag, limit, 2)
    
    // NGフィルタリングを適用
    const { items: filtered2 } = await filterRankingData({ items: page2Items as any })
    
    console.log(`\nページ2結果:`)
    console.log(`  取得: ${page2Items.length}件`)
    console.log(`  フィルタリング後: ${filtered2.length}件`)
    if (filtered2.length > 0) {
      console.log(`  1件目: ${filtered2[0].title}`)
      console.log(`  最後: ${filtered2[filtered2.length - 1].title}`)
    }
    
    // 重複チェック
    if (filtered1.length > 0 && filtered2.length > 0) {
      const lastIdPage1 = filtered1[filtered1.length - 1].id
      const firstIdPage2 = filtered2[0].id
      console.log(`\n重複チェック:`)
      console.log(`  ページ1最後のID: ${lastIdPage1}`)
      console.log(`  ページ2最初のID: ${firstIdPage2}`)
      console.log(`  重複: ${lastIdPage1 === firstIdPage2 ? 'あり（問題）' : 'なし（OK）'}`)
    }
    
    // ページ3を取得
    console.log('\nページ3を取得中...')
    const { items: page3Items } = await scrapeRankingPage(genre, period, tag, limit, 3)
    
    console.log(`\nページ3結果:`)
    console.log(`  取得: ${page3Items.length}件`)
    
    if (page3Items.length === 0) {
      console.log('  → データがないため、これ以上のページは存在しません')
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

testTagPaginationDirect().catch(console.error)