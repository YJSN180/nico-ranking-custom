// タグ別ランキングの重複問題をデバッグするスクリプト

import { scrapeRankingPage } from '../lib/scraper'
import { filterRankingData } from '../lib/ng-filter'
import type { RankingItem } from '../types/ranking'

async function debugTagRankingDuplication() {
  console.log('=== タグ別ランキング重複調査 ===\n')
  
  const genre = 'other'
  const period = '24h'
  const tag = 'ゲーム' // 人気タグの例
  
  const targetCount = 300
  const allItems: RankingItem[] = []
  const seenVideoIds = new Set<string>()
  const duplicateCount = new Map<string, number>()
  let page = 1
  const maxPages = 8
  
  console.log(`対象: ${genre}ジャンル / ${period} / タグ: ${tag}\n`)
  
  while (allItems.length < targetCount && page <= maxPages) {
    try {
      console.log(`ページ${page}を取得中...`)
      const { items: pageItems } = await scrapeRankingPage(genre, period, tag, 100, page)
      
      console.log(`  - 取得件数: ${pageItems.length}件`)
      
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
      })).filter(item => item.id && item.title)
      
      // NGフィルタリング
      const { items: filteredItems } = await filterRankingData({ items: convertedItems })
      console.log(`  - NGフィルタリング後: ${filteredItems.length}件`)
      
      // 重複チェック
      let newItemCount = 0
      let duplicateInThisPage = 0
      
      for (const item of filteredItems) {
        if (!seenVideoIds.has(item.id)) {
          seenVideoIds.add(item.id)
          allItems.push(item)
          newItemCount++
        } else {
          duplicateInThisPage++
          duplicateCount.set(item.id, (duplicateCount.get(item.id) || 1) + 1)
        }
      }
      
      console.log(`  - 新規動画: ${newItemCount}件`)
      console.log(`  - 重複動画: ${duplicateInThisPage}件`)
      console.log(`  - 累計ユニーク動画数: ${allItems.length}件\n`)
      
      page++
      
      // レート制限対策
      if (page <= maxPages && allItems.length < targetCount) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      console.error(`エラー発生 (ページ${page}):`, error)
      break
    }
  }
  
  console.log('=== 最終結果 ===')
  console.log(`総ページ数: ${page - 1}`)
  console.log(`ユニーク動画数: ${allItems.length}件`)
  console.log(`重複動画の総数: ${duplicateCount.size}件`)
  
  if (duplicateCount.size > 0) {
    console.log('\n重複が多い動画TOP10:')
    const sortedDuplicates = Array.from(duplicateCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    
    for (const [videoId, count] of sortedDuplicates) {
      const video = allItems.find(item => item.id === videoId)
      console.log(`  - ${video?.title || videoId}: ${count}回重複`)
    }
  }
  
  // 300件に満たない場合の分析
  if (allItems.length < targetCount) {
    console.log(`\n⚠️  目標の${targetCount}件に到達できませんでした`)
    console.log(`不足分: ${targetCount - allItems.length}件`)
    
    if (page > maxPages) {
      console.log(`原因: 最大ページ数(${maxPages})に到達`)
    } else {
      console.log(`原因: データが尽きた可能性`)
    }
  }
}

// スクリプト実行
debugTagRankingDuplication().catch(console.error)