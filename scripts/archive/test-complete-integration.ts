// 完全な統合テスト
import { completeHybridScrape } from '../lib/complete-hybrid-scraper'

async function testCompleteIntegration() {
  console.log('=== 完全統合テスト ===\n')
  
  // 1. 例のソレジャンル（24時間）
  console.log('1. 例のソレジャンル（24時間ランキング）')
  try {
    const reiSore24h = await completeHybridScrape('d2um7mc4', '24h')
    console.log(`  取得件数: ${reiSore24h.items.length}件`)
    console.log(`  人気タグ: ${reiSore24h.popularTags?.join(', ') || 'なし'}`)
    
    if (reiSore24h.items.length > 0) {
      console.log('\n  TOP 5:')
      reiSore24h.items.slice(0, 5).forEach(item => {
        console.log(`    ${item.rank}位. ${item.title}`)
        console.log(`       再生: ${item.views?.toLocaleString()}, いいね: ${item.likes?.toLocaleString()}`)
      })
    }
  } catch (error) {
    console.error(`  エラー: ${error}`)
  }
  
  // 2. 例のソレジャンル（毎時）
  console.log('\n\n2. 例のソレジャンル（毎時ランキング）')
  try {
    const reiSoreHour = await completeHybridScrape('d2um7mc4', 'hour')
    console.log(`  取得件数: ${reiSoreHour.items.length}件`)
    
    if (reiSoreHour.items.length > 0) {
      console.log('\n  TOP 5:')
      reiSoreHour.items.slice(0, 5).forEach(item => {
        console.log(`    ${item.rank}位. ${item.title}`)
        console.log(`       再生: ${item.views?.toLocaleString()}, いいね: ${item.likes?.toLocaleString()}`)
      })
    }
  } catch (error) {
    console.error(`  エラー: ${error}`)
  }
  
  // 3. その他ジャンル（比較用）
  console.log('\n\n3. その他ジャンル（24時間ランキング）')
  try {
    const other24h = await completeHybridScrape('other', '24h')
    console.log(`  取得件数: ${other24h.items.length}件`)
    console.log(`  人気タグ: ${other24h.popularTags?.join(', ') || 'なし'}`)
    
    if (other24h.items.length > 0) {
      console.log('\n  TOP 3:')
      other24h.items.slice(0, 3).forEach(item => {
        console.log(`    ${item.rank}位. ${item.title}`)
        console.log(`       再生: ${item.views?.toLocaleString()}`)
      })
    }
  } catch (error) {
    console.error(`  エラー: ${error}`)
  }
  
  // 4. 総合ランキング（比較用）
  console.log('\n\n4. 総合ランキング（24時間）')
  try {
    const all24h = await completeHybridScrape('all', '24h')
    console.log(`  取得件数: ${all24h.items.length}件`)
    
    if (all24h.items.length > 0) {
      console.log('\n  TOP 3:')
      all24h.items.slice(0, 3).forEach(item => {
        console.log(`    ${item.rank}位. ${item.title}`)
        console.log(`       再生: ${item.views?.toLocaleString()}`)
      })
    }
  } catch (error) {
    console.error(`  エラー: ${error}`)
  }
}

testCompleteIntegration().catch(console.error)