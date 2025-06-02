import dotenv from 'dotenv'
import path from 'path'
import { scrapeRankingPage } from '../lib/scraper'
import { filterRankingData } from '../lib/ng-filter'

// .env.localを読み込む
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function testTag100Items() {
  console.log('=== タグ別ランキング100件確保テスト ===\n')
  
  const genre = 'other'
  const period = '24h' as const
  const tag = 'インタビューシリーズ'
  
  // APIのロジックを再現
  console.log('APIロジックの再現（ページ1）:\n')
  
  let allItems: any[] = []
  const targetCount = 100
  let currentPage = 1
  const maxAttempts = 3
  
  while (allItems.length < targetCount && currentPage < 1 + maxAttempts) {
    console.log(`ページ${currentPage}を取得中...`)
    const { items: pageItems } = await scrapeRankingPage(genre, period, tag, 100, currentPage)
    
    console.log(`  取得: ${pageItems.length}件`)
    
    // マッピング
    const mappedItems = pageItems.map((item: any) => ({
      rank: item.rank || 0,
      id: item.id || '',
      title: item.title || '',
      thumbURL: item.thumbURL || '',
      views: item.views || 0,
      comments: item.comments,
      mylists: item.mylists,
      likes: item.likes,
      tags: item.tags,
      authorId: item.authorId,
      authorName: item.authorName,
      authorIcon: item.authorIcon,
      registeredAt: item.registeredAt,
    })).filter((item: any) => item.id && item.title)
    
    // NGフィルタリング
    const { items: filtered } = await filterRankingData({ items: mappedItems })
    console.log(`  NGフィルタリング後: ${filtered.length}件`)
    console.log(`  削除: ${mappedItems.length - filtered.length}件`)
    
    allItems.push(...filtered)
    console.log(`  累計: ${allItems.length}件\n`)
    
    if (pageItems.length < 100) {
      console.log('  → これ以上データがありません')
      break
    }
    
    if (allItems.length >= targetCount) {
      console.log('  → 100件確保できました！')
      break
    }
    
    currentPage++
  }
  
  // 100件に切り詰め
  const finalItems = allItems.slice(0, targetCount)
  
  console.log('\n=== 結果 ===')
  console.log(`最終アイテム数: ${finalItems.length}件`)
  console.log(`取得ページ数: ${currentPage}ページ`)
  
  if (finalItems.length === targetCount) {
    console.log('\n✅ 成功: NGフィルタリング後も100件確保できました！')
  } else {
    console.log(`\n⚠️  警告: ${finalItems.length}件しか確保できませんでした`)
  }
  
  // 最初と最後のアイテムを表示
  if (finalItems.length > 0) {
    console.log(`\n最初: ${finalItems[0].title}`)
    console.log(`最後: ${finalItems[finalItems.length - 1].title}`)
  }
}

testTag100Items().catch(console.error)