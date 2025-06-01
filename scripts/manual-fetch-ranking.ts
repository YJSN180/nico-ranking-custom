#!/usr/bin/env tsx

import { fetchRanking } from '../lib/complete-hybrid-scraper'

async function manualFetch() {
  const genre = process.argv[2] || 'game'
  const tag = process.argv[3] || null
  
  console.log(`=== 手動ランキング取得: ${genre} ${tag ? `(タグ: ${tag})` : ''} ===\n`)
  
  try {
    const result = await fetchRanking(genre, tag, '24h')
    
    console.log(`ジャンル: ${result.genre} (${result.label})`)
    console.log(`アイテム数: ${result.items.length}`)
    console.log(`人気タグ数: ${result.popularTags.length}`)
    
    if (result.popularTags.length > 0) {
      console.log(`\n人気タグ:`)
      result.popularTags.forEach((tag, i) => {
        console.log(`${i + 1}. ${tag}`)
      })
    }
    
    console.log(`\nランキングTOP5:`)
    result.items.slice(0, 5).forEach(item => {
      console.log(`${item.rank}. ${item.title} (${item.views.toLocaleString()} views)`)
    })
    
    // タグ別ランキングのテスト
    if (!tag && result.popularTags.length > 0) {
      console.log(`\n=== タグ別ランキングテスト: ${result.popularTags[0]} ===\n`)
      
      const tagResult = await fetchRanking(genre, result.popularTags[0], '24h')
      console.log(`アイテム数: ${tagResult.items.length}`)
      console.log(`\nTOP3:`)
      tagResult.items.slice(0, 3).forEach(item => {
        console.log(`${item.rank}. ${item.title} (${item.views.toLocaleString()} views)`)
      })
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

if (require.main === module) {
  manualFetch()
}