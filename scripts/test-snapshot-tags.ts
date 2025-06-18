#!/usr/bin/env npx tsx
import { fetchVideoStats } from '../lib/snapshot-api'

async function testSnapshotTags() {
  console.log('=== Snapshot APIのタグ取得テスト ===\n')
  
  try {
    const videoIds = ['sm2667147', 'sm45098479', 'sm45096412']
    
    console.log('1. Snapshot APIで動画情報を取得中...')
    console.log(`  対象動画: ${videoIds.join(', ')}`)
    
    const stats = await fetchVideoStats(videoIds)
    
    console.log('\n2. 取得結果:')
    for (const [videoId, stat] of Object.entries(stats)) {
      console.log(`\n  ${videoId}:`)
      console.log(`    再生数: ${stat.viewCounter}`)
      console.log(`    コメント: ${stat.commentCounter}`)
      console.log(`    マイリスト: ${stat.mylistCounter}`)
      console.log(`    いいね: ${stat.likeCounter}`)
      console.log(`    タグ数: ${stat.tags?.length || 0}`)
      if (stat.tags && stat.tags.length > 0) {
        console.log(`    タグ: ${stat.tags.join(', ')}`)
      }
    }
    
    // 結果の確認
    const videosWithTags = Object.entries(stats).filter(([_, stat]) => stat.tags && stat.tags.length > 0)
    console.log(`\n3. タグが取得できた動画: ${videosWithTags.length}/${videoIds.length}`)
    
    if (videosWithTags.length === 0) {
      console.log('\n⚠️ Snapshot APIからタグが取得できませんでした')
      console.log('  これは仕様上の制限である可能性があります')
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
  }
}

testSnapshotTags()