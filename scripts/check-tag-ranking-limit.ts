/**
 * タグ別ランキングの上限を確認するスクリプト
 */

import { fetchRanking } from '../lib/complete-hybrid-scraper'

async function checkTagRankingLimit() {
  console.log('タグ別ランキングの上限を確認します...\n')

  try {
    // ゲームジャンルの「ゲーム」タグで確認
    const genre = 'game'
    const tag = 'ゲーム'
    let allItems: any[] = []
    let page = 1
    let hasMore = true

    console.log(`ジャンル: ${genre}, タグ: ${tag}`)
    console.log('ページごとの取得を開始...\n')

    while (hasMore && page <= 10) { // 最大10ページまで試す
      console.log(`ページ ${page} を取得中...`)
      
      const result = await fetchRanking(genre, tag, '24h', 100, page)
      
      if (result.items.length === 0) {
        console.log(`ページ ${page}: データなし`)
        hasMore = false
      } else {
        console.log(`ページ ${page}: ${result.items.length}件取得`)
        allItems = allItems.concat(result.items)
        
        // 100件未満なら次はない
        if (result.items.length < 100) {
          hasMore = false
        }
        
        page++
      }
      
      // レート制限対策
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    console.log(`\n=== 結果 ===`)
    console.log(`取得ページ数: ${page - 1}`)
    console.log(`合計件数: ${allItems.length}件`)
    
    if (allItems.length > 0) {
      console.log(`最初の動画: ${allItems[0].title}`)
      console.log(`最後の動画: ${allItems[allItems.length - 1].title}`)
    }

    // 300件を超えているか確認
    if (allItems.length > 300) {
      console.log('\n⚠️ 300件を超えるデータが取得できました！')
      console.log('タグ別ランキングは300件を超える可能性があります。')
    } else if (allItems.length === 300) {
      console.log('\n✅ ちょうど300件で終了しました。')
      console.log('タグ別ランキングも300件が上限の可能性が高いです。')
    } else {
      console.log(`\n✅ ${allItems.length}件で終了しました。`)
    }

  } catch (error) {
    console.error('エラーが発生しました:', error)
  }
}

// 実行
checkTagRankingLimit()