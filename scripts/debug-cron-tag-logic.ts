#!/usr/bin/env node

import { scrapeRankingPage } from '../lib/scraper'
import { filterRankingData } from '../lib/ng-filter'
import type { RankingItem } from '../types/ranking'

async function debugCronTagLogic() {
  console.log('=== Cronジョブのタグ別ランキング取得ロジックのデバッグ ===\n')
  
  const genre = 'other'
  const period: '24h' | 'hour' = '24h'
  const tag = 'ゲーム'
  const targetCount = 300
  
  console.log(`設定:`)
  console.log(`- ジャンル: ${genre}`)
  console.log(`- 期間: ${period}`)
  console.log(`- タグ: ${tag}`)
  console.log(`- 目標件数: ${targetCount}件\n`)
  
  // Cronジョブのロジックを再現
  const allTagItems: RankingItem[] = []
  let tagPage = 1
  const maxTagPages = 5
  
  console.log('Cronジョブの取得ロジック（scrapeRankingPage使用）:')
  
  while (allTagItems.length < targetCount && tagPage <= maxTagPages) {
    console.log(`\nページ ${tagPage} を取得中...`)
    
    try {
      const { items: pageTagItems } = await scrapeRankingPage(genre, period, tag, 100, tagPage)
      console.log(`- scrapeRankingPageから取得: ${pageTagItems.length}件`)
      
      // Partial<RankingItem>をRankingItemに変換（cronと同じロジック）
      const convertedTagItems: RankingItem[] = pageTagItems.map((item): RankingItem => ({
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
      }))
      
      console.log(`- 変換後: ${convertedTagItems.length}件`)
      
      // 最初と最後のアイテムのランク番号を確認
      if (convertedTagItems.length > 0) {
        console.log(`- 最初のアイテム: Rank ${convertedTagItems[0].rank} - ${convertedTagItems[0].title}`)
        console.log(`- 最後のアイテム: Rank ${convertedTagItems[convertedTagItems.length - 1].rank} - ${convertedTagItems[convertedTagItems.length - 1].title}`)
      }
      
      const { items: filteredTagItems } = await filterRankingData({ items: convertedTagItems })
      console.log(`- NGフィルタリング後: ${filteredTagItems.length}件`)
      
      allTagItems.push(...filteredTagItems)
      console.log(`- 累計: ${allTagItems.length}件`)
      
      tagPage++
      
      // 500msの遅延
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      console.error(`ページ ${tagPage} の取得に失敗:`, error)
      break
    }
  }
  
  console.log('\n=== 最終結果 ===')
  console.log(`総取得件数: ${allTagItems.length}件`)
  console.log(`取得ページ数: ${tagPage - 1}ページ`)
  
  // 300件に切り詰め、ランク番号を振り直す（cronと同じ）
  const tagRankingItems = allTagItems.slice(0, targetCount).map((item, index) => ({
    ...item,
    rank: index + 1
  }))
  
  console.log(`最終的な件数: ${tagRankingItems.length}件`)
  
  // ランク番号の確認
  console.log('\n最初の5件:')
  tagRankingItems.slice(0, 5).forEach(item => {
    console.log(`- Rank ${item.rank}: ${item.title}`)
  })
  
  console.log('\n最後の5件:')
  tagRankingItems.slice(-5).forEach(item => {
    console.log(`- Rank ${item.rank}: ${item.title}`)
  })
  
  // 重複チェック
  const idSet = new Set(tagRankingItems.map(item => item.id))
  console.log(`\n重複チェック: ${tagRankingItems.length}件中${idSet.size}件がユニーク`)
  if (idSet.size < tagRankingItems.length) {
    console.log('⚠️ 重複が検出されました!')
  }
}

// スクリプトを実行
debugCronTagLogic().catch(console.error)