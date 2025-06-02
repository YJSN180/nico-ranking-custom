#!/usr/bin/env node

import { fetchRanking } from '../lib/complete-hybrid-scraper'
import { filterRankingData } from '../lib/ng-filter'
import type { RankingItem } from '../types/ranking'

async function debugTagRankingPagination() {
  console.log('=== タグ別ランキングのページネーションデバッグ ===\n')
  
  const genre = 'other'
  const period = '24h'
  const tag = 'ゲーム' // 人気タグの例
  const targetCount = 300
  
  console.log(`設定:`)
  console.log(`- ジャンル: ${genre}`)
  console.log(`- 期間: ${period}`)
  console.log(`- タグ: ${tag}`)
  console.log(`- 目標件数: ${targetCount}件\n`)
  
  const allItems: RankingItem[] = []
  const pageResults: { page: number; fetched: number; filtered: number; duplicates: number }[] = []
  const seenIds = new Set<string>()
  
  let page = 1
  const maxPages = 5
  
  console.log('ページごとの取得結果:')
  
  while (allItems.length < targetCount && page <= maxPages) {
    console.log(`\nページ ${page} を取得中...`)
    
    try {
      // ページを指定して取得
      const { items: pageItems } = await fetchRanking(genre, tag, period, 100, page)
      
      console.log(`- 取得件数: ${pageItems.length}件`)
      
      // 重複チェック
      let duplicates = 0
      const uniqueItems: RankingItem[] = []
      
      for (const item of pageItems) {
        if (seenIds.has(item.id)) {
          duplicates++
          console.log(`  - 重複検出: ${item.id} "${item.title}"`)
        } else {
          seenIds.add(item.id)
          uniqueItems.push(item)
        }
      }
      
      console.log(`- 重複件数: ${duplicates}件`)
      console.log(`- ユニーク件数: ${uniqueItems.length}件`)
      
      // NGフィルタリング
      const { items: filteredItems } = await filterRankingData({ items: uniqueItems })
      console.log(`- NGフィルタリング後: ${filteredItems.length}件`)
      
      // 最初と最後のアイテムを表示
      if (filteredItems.length > 0) {
        console.log(`- 最初のアイテム: Rank ${filteredItems[0].rank} - ${filteredItems[0].title}`)
        console.log(`- 最後のアイテム: Rank ${filteredItems[filteredItems.length - 1].rank} - ${filteredItems[filteredItems.length - 1].title}`)
      }
      
      allItems.push(...filteredItems)
      
      pageResults.push({
        page,
        fetched: pageItems.length,
        filtered: filteredItems.length,
        duplicates
      })
      
      page++
      
      // レート制限対策
      if (page <= maxPages && allItems.length < targetCount) {
        console.log('500ms待機中...')
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      console.error(`ページ ${page} の取得に失敗:`, error)
      break
    }
  }
  
  console.log('\n=== 結果サマリー ===')
  console.log(`総取得件数: ${allItems.length}件`)
  console.log(`取得ページ数: ${page - 1}ページ`)
  
  console.log('\nページごとの詳細:')
  pageResults.forEach(result => {
    console.log(`- ページ ${result.page}: 取得 ${result.fetched}件, フィルタ後 ${result.filtered}件, 重複 ${result.duplicates}件`)
  })
  
  // ランク番号の連続性をチェック
  console.log('\nランク番号の連続性チェック:')
  const rankGaps: number[] = []
  for (let i = 1; i < allItems.length; i++) {
    const prevRank = allItems[i - 1].rank
    const currentRank = allItems[i].rank
    if (currentRank !== prevRank + 1 && currentRank > prevRank) {
      rankGaps.push(i)
      console.log(`- ギャップ検出: ${prevRank} → ${currentRank} (インデックス ${i})`)
    }
  }
  
  if (rankGaps.length === 0) {
    console.log('- ランク番号は連続しています')
  }
  
  // URLパラメータの確認
  console.log('\n各ページのURL構築:')
  for (let p = 1; p <= 3; p++) {
    const url = `https://www.nicovideo.jp/ranking/genre/other?term=${period}&tag=${encodeURIComponent(tag)}&page=${p}`
    console.log(`- ページ ${p}: ${url}`)
  }
}

// スクリプトを実行
debugTagRankingPagination().catch(console.error)