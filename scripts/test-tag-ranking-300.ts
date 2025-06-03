import { scrapeRankingPage } from '@/lib/scraper'
import { filterRankingData } from '@/lib/ng-filter'
import type { RankingItem } from '@/types/ranking'

async function testTagRanking300() {
  console.log('=== タグ別ランキング300件取得テスト ===\n')
  
  const genre = 'other'
  const period = '24h'
  const tag = '田所浩治(佐倉市)'
  
  console.log(`ジャンル: ${genre}`)
  console.log(`期間: ${period}`)
  console.log(`タグ: ${tag}\n`)
  
  try {
    // 300件取得を試みる
    const targetCount = 300
    const allItems: RankingItem[] = []
    const seenVideoIds = new Set<string>()
    let page = 1
    const maxPages = 8
    
    console.log('ページごとの取得状況:')
    
    while (allItems.length < targetCount && page <= maxPages) {
      const startTime = Date.now()
      
      try {
        const { items: pageItems } = await scrapeRankingPage(genre, period, tag, 100, page)
        
        if (!pageItems || pageItems.length === 0) {
          console.log(`ページ ${page}: アイテムなし - 取得終了`)
          break
        }
        
        // 型変換
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
          registeredAt: item.registeredAt
        })).filter((item: any) => item.id && item.title)
        
        // NGフィルタリング
        const { items: filteredItems } = await filterRankingData({ items: convertedItems })
        
        // 重複除外
        let addedCount = 0
        for (const item of filteredItems) {
          if (!seenVideoIds.has(item.id)) {
            seenVideoIds.add(item.id)
            allItems.push(item)
            addedCount++
          }
        }
        
        const elapsedTime = Date.now() - startTime
        console.log(`ページ ${page}: 取得${pageItems.length}件 → フィルタ後${filteredItems.length}件 → 追加${addedCount}件 (累計${allItems.length}件) - ${elapsedTime}ms`)
        
        // サンプルとして最初のアイテムを表示
        if (page === 1 && filteredItems.length > 0) {
          const sample = filteredItems[0]
          console.log(`  サンプル: "${sample.title}" (${sample.views}再生)`)
        }
        
        page++
        
        // レート制限対策
        if (page <= maxPages && allItems.length < targetCount) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      } catch (pageError) {
        console.error(`ページ ${page} エラー:`, pageError)
        break
      }
    }
    
    console.log(`\n=== 結果 ===`)
    console.log(`総取得件数: ${allItems.length}件`)
    console.log(`目標件数: ${targetCount}件`)
    console.log(`達成率: ${Math.round(allItems.length / targetCount * 100)}%`)
    
    // 300件に切り詰め
    const finalItems = allItems.slice(0, targetCount).map((item, index) => ({
      ...item,
      rank: index + 1
    }))
    
    console.log(`\n最終件数: ${finalItems.length}件`)
    
    // 最初と最後のアイテムを表示
    if (finalItems.length > 0) {
      console.log(`\n最初のアイテム:`)
      console.log(`  #${finalItems[0].rank} "${finalItems[0].title}"`)
      console.log(`  再生数: ${finalItems[0].views}`)
      
      if (finalItems.length > 1) {
        const last = finalItems[finalItems.length - 1]
        console.log(`\n最後のアイテム:`)
        console.log(`  #${last.rank} "${last.title}"`)
        console.log(`  再生数: ${last.views}`)
      }
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 実行
testTagRanking300().catch(console.error)