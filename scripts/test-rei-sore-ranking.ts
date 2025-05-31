// 例のソレジャンルのランキング取得テスト
import { getReiSoreRanking, fetchReiSoreVideos, calculateRankingScore } from '../lib/rei-sore-ranking'

async function testReiSoreRanking() {
  console.log('=== 例のソレジャンルランキングテスト ===\n')
  
  // 1. Snapshot APIから直接動画を取得してテスト
  console.log('1. Snapshot APIから動画を取得中...')
  const videos = await fetchReiSoreVideos()
  console.log(`取得した動画数: ${videos.length}件`)
  
  if (videos.length > 0) {
    console.log('\n最初の5件の動画:')
    videos.slice(0, 5).forEach((video, index) => {
      console.log(`${index + 1}. ${video.title}`)
      console.log(`   ID: ${video.content_id}`)
      console.log(`   再生数: ${video.view_count.toLocaleString()}, いいね: ${video.like_count.toLocaleString()}`)
      console.log(`   スコア(24h): ${Math.floor(calculateRankingScore(video, 'daily')).toLocaleString()}`)
      console.log(`   スコア(毎時): ${Math.floor(calculateRankingScore(video, 'hourly')).toLocaleString()}`)
    })
  }
  
  // 2. 24時間ランキングを取得
  console.log('\n\n2. 24時間ランキングを取得中...')
  try {
    const dailyRanking = await getReiSoreRanking('daily', 10)
    console.log(`24時間ランキング TOP10:`)
    dailyRanking.forEach(item => {
      console.log(`${item.rank}位. ${item.title}`)
      console.log(`    再生: ${item.views.toLocaleString()}, いいね: ${item.likes.toLocaleString()}, スコア: ${item.score.toLocaleString()}`)
    })
  } catch (error) {
    console.error('24時間ランキング取得エラー:', error)
  }
  
  // 3. 毎時ランキングを取得
  console.log('\n\n3. 毎時ランキングを取得中...')
  try {
    const hourlyRanking = await getReiSoreRanking('hourly', 10)
    console.log(`毎時ランキング TOP10:`)
    hourlyRanking.forEach(item => {
      console.log(`${item.rank}位. ${item.title}`)
      console.log(`    再生: ${item.views.toLocaleString()}, いいね: ${item.likes.toLocaleString()}, スコア: ${item.score.toLocaleString()}`)
    })
  } catch (error) {
    console.error('毎時ランキング取得エラー:', error)
  }
}

// 実行
testReiSoreRanking().catch(console.error)