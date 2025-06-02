import { scrapeRankingPage } from '../lib/scraper'
import { filterRankingData } from '../lib/ng-filter'
import type { RankingItem } from '../types/ranking'

async function testCron300Items() {
  console.log('=== Cron jobの300件取得ロジックをテスト ===\n')
  
  const genre = 'game'
  const period = '24h' as const
  const targetCount = 300
  const allItems: RankingItem[] = []
  let popularTags: string[] = []
  let page = 1
  const maxPages = 5
  
  console.log(`ターゲット: ${genre}ジャンル, ${period}期間, ${targetCount}件\n`)
  
  while (allItems.length < targetCount && page <= maxPages) {
    console.log(`\nページ${page}を取得中...`)
    
    try {
      const { items: pageItems, popularTags: pageTags } = await scrapeRankingPage(genre, period, undefined, 100, page)
      
      console.log(`  取得件数: ${pageItems.length}件`)
      
      // 最初のページから人気タグを取得
      if (page === 1 && pageTags) {
        popularTags = pageTags
        console.log(`  人気タグ: ${popularTags.slice(0, 5).join(', ')}`)
      }
      
      // Partial<RankingItem>をRankingItemに変換
      const convertedItems: RankingItem[] = pageItems.map((item): RankingItem => ({
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
      
      console.log(`  変換後: ${convertedItems.length}件`)
      
      // NGフィルタリングを適用
      const { items: filteredItems } = await filterRankingData({ items: convertedItems })
      
      console.log(`  NGフィルタ後: ${filteredItems.length}件`)
      
      allItems.push(...filteredItems)
      console.log(`  累計: ${allItems.length}件`)
      
      page++
      
      // レート制限対策
      if (page <= maxPages && allItems.length < targetCount) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      console.error(`  エラー: ${error}`)
      break
    }
  }
  
  // 300件に切り詰め、ランク番号を振り直す
  const finalItems = allItems.slice(0, targetCount).map((item, index) => ({
    ...item,
    rank: index + 1
  }))
  
  console.log('\n=== 結果 ===')
  console.log(`最終取得件数: ${finalItems.length}件`)
  console.log(`ページ数: ${page - 1}`)
  
  if (finalItems.length > 100) {
    console.log('\n✅ 100件以上取得成功！')
    console.log(`1位: ${finalItems[0]?.title}`)
    console.log(`100位: ${finalItems[99]?.title}`)
    console.log(`101位: ${finalItems[100]?.title || 'なし'}`)
    console.log(`200位: ${finalItems[199]?.title || 'なし'}`)
    console.log(`最後: ${finalItems[finalItems.length - 1]?.title}`)
  } else {
    console.log('\n❌ 100件以下しか取得できませんでした')
  }
}

testCron300Items().catch(console.error)