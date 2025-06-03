// 実際のニコニコ動画APIでタグ別ランキングのページネーションをテスト

import { fetchRanking } from '../lib/complete-hybrid-scraper'

async function testActualTagRankingAPI() {
  console.log('=== 実際のタグ別ランキングAPI動作確認 ===\n')
  
  const genre = 'other'
  const tag = 'ゆっくり実況プレイ' // 人気タグの例
  const term = '24h'
  
  const videoIdsByPage = new Map<number, Set<string>>()
  const allVideoIds = new Set<string>()
  
  try {
    // 最初の3ページを取得して重複を調査
    for (let page = 1; page <= 3; page++) {
      console.log(`\nページ${page}を取得中...`)
      
      const result = await fetchRanking(genre, tag, term, 100, page)
      const pageIds = new Set<string>()
      
      console.log(`取得件数: ${result.items.length}件`)
      
      // このページの動画IDを記録
      result.items.forEach(item => {
        pageIds.add(item.id)
        allVideoIds.add(item.id)
      })
      
      videoIdsByPage.set(page, pageIds)
      
      // 前のページとの重複をチェック
      if (page > 1) {
        for (let prevPage = 1; prevPage < page; prevPage++) {
          const prevPageIds = videoIdsByPage.get(prevPage)!
          const duplicates = new Set(
            [...pageIds].filter(id => prevPageIds.has(id))
          )
          
          if (duplicates.size > 0) {
            console.log(`  ⚠️ ページ${prevPage}との重複: ${duplicates.size}件`)
            
            // 重複している動画の詳細を表示
            const duplicateItems = result.items.filter(item => duplicates.has(item.id))
            console.log('  重複動画の例:')
            duplicateItems.slice(0, 3).forEach(item => {
              console.log(`    - ${item.title} (ID: ${item.id})`)
            })
          }
        }
      }
      
      // レート制限対策
      if (page < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    console.log('\n=== 重複分析結果 ===')
    console.log(`総ユニーク動画数: ${allVideoIds.size}件`)
    console.log(`期待される動画数: ${100 * 3} = 300件`)
    console.log(`重複による減少: ${300 - allVideoIds.size}件`)
    console.log(`重複率: ${((300 - allVideoIds.size) / 300 * 100).toFixed(1)}%`)
    
    // 各ページのユニーク動画数
    console.log('\n各ページのユニーク動画数:')
    for (let page = 1; page <= 3; page++) {
      const pageIds = videoIdsByPage.get(page)!
      console.log(`  ページ${page}: ${pageIds.size}件`)
    }
    
  } catch (error) {
    console.error('エラー発生:', error)
  }
}

// スクリプト実行
testActualTagRankingAPI().catch(console.error)