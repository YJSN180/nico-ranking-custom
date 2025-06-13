/**
 * 動画統計情報APIでタグも取得できるかテスト
 */

import { fetchVideoStats } from '../lib/snapshot-api'

async function testVideoStatsWithTags() {
  console.log('=== 動画統計情報API タグ取得テスト ===\n')
  
  // 最新の人気動画IDでテスト
  const testVideoIds = [
    'sm45081492', // 琴葉茜とユニティを自動化して無限にガチャを引くゲーム
    'sm45084617', // 琴葉茜の闇ゲー#197
    'sm45080414', // 革付き同人誌通販のお知らせ
    'sm11398357', // DECO*27 - モザイクロール (古い動画)
    'sm27965309'  // DECO*27 - ゴーストルール (古い動画)
  ]
  
  console.log('テスト対象動画:')
  testVideoIds.forEach(id => console.log(`- ${id}`))
  console.log()
  
  try {
    const stats = await fetchVideoStats(testVideoIds)
    
    console.log('取得結果:')
    for (const videoId of testVideoIds) {
      const videoStats = stats[videoId]
      if (videoStats) {
        console.log(`\n${videoId}:`)
        console.log(`  再生数: ${videoStats.viewCounter || 0}`)
        console.log(`  コメント: ${videoStats.commentCounter || 0}`)
        console.log(`  マイリスト: ${videoStats.mylistCounter || 0}`)
        console.log(`  いいね: ${videoStats.likeCounter || 0}`)
        console.log(`  タグ: ${videoStats.tags ? `[${videoStats.tags.join(', ')}] (${videoStats.tags.length}件)` : 'なし'}`)
      } else {
        console.log(`\n${videoId}: データ取得失敗`)
      }
    }
    
    // タグが取得できた動画の割合
    const videosWithTags = Object.values(stats).filter(s => s.tags && s.tags.length > 0).length
    console.log(`\n\nタグ取得成功率: ${videosWithTags}/${testVideoIds.length} (${Math.round(videosWithTags / testVideoIds.length * 100)}%)`)
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 実行
if (require.main === module) {
  testVideoStatsWithTags().catch(console.error)
}

export default testVideoStatsWithTags