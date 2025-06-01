// 完全なランキング取得システムのテスト

import { fetchRanking, fetchMultipleRankings, DEFAULT_COMBINATIONS } from '../lib/complete-hybrid-scraper'

async function testCompleteSystem() {
  console.log('=== 完全なランキング取得システムのテスト ===\n')
  console.log(new Date().toLocaleString('ja-JP'))
  console.log('\n')
  
  // 1. 単一ランキングのテスト
  console.log('=== 1. 単一ランキングのテスト ===')
  try {
    const totalRanking = await fetchRanking('all', null, '24h')
    console.log('✅ 総合24時間ランキング取得成功')
    console.log(`- ジャンル: ${totalRanking.label} (${totalRanking.genre})`)
    console.log(`- アイテム数: ${totalRanking.items.length}`)
    console.log(`- 1位: ${totalRanking.items[0]?.title}`)
    if (totalRanking.popularTags) {
      console.log(`- 人気タグ: ${totalRanking.popularTags.slice(0, 5).join(', ')}...`)
    }
  } catch (error) {
    console.error('❌ エラー:', error)
  }
  
  console.log('\n')
  
  // 2. ジャンル別ランキングのテスト
  console.log('=== 2. ジャンル別ランキングのテスト ===')
  try {
    const gameRanking = await fetchRanking('4eet3ca4', null, '24h')
    console.log('✅ ゲーム24時間ランキング取得成功')
    console.log(`- ジャンル: ${gameRanking.label} (${gameRanking.genre})`)
    console.log(`- アイテム数: ${gameRanking.items.length}`)
    console.log(`- 1位: ${gameRanking.items[0]?.title}`)
    if (gameRanking.popularTags) {
      console.log(`- 人気タグ: ${gameRanking.popularTags.slice(0, 5).join(', ')}...`)
    }
  } catch (error) {
    console.error('❌ エラー:', error)
  }
  
  console.log('\n')
  
  // 3. 例のソレジャンルのテスト（エラーになるはず）
  console.log('=== 3. 例のソレジャンルのテスト ===')
  try {
    await fetchRanking('d2um7mc4', null, '24h')
    console.error('❌ エラーが発生しませんでした（想定外）')
  } catch (error) {
    console.log('✅ 期待通りエラー:', error.message)
  }
  
  console.log('\n')
  
  // 4. 複数ランキングの並列取得テスト
  console.log('=== 4. 複数ランキングの並列取得テスト ===')
  const testCombinations = [
    { genre: 'all', tag: null, term: '24h' },
    { genre: '4eet3ca4', tag: null, term: 'hour' },
    { genre: 'zc49b03a', tag: null, term: '24h' },
  ]
  
  const startTime = Date.now()
  try {
    const results = await fetchMultipleRankings(testCombinations)
    const elapsed = Date.now() - startTime
    
    console.log(`✅ ${results.length}/${testCombinations.length}件取得成功`)
    console.log(`- 実行時間: ${elapsed}ms`)
    
    results.forEach(result => {
      console.log(`- ${result.label}: ${result.items.length}件`)
    })
  } catch (error) {
    console.error('❌ エラー:', error)
  }
  
  console.log('\n')
  
  // 5. 人気タグの確認
  console.log('=== 5. 人気タグの確認 ===')
  const genresToCheck = ['4eet3ca4', 'zc49b03a', 'ramuboyn']
  
  for (const genreId of genresToCheck) {
    try {
      const ranking = await fetchRanking(genreId, null, '24h')
      console.log(`\n${ranking.label}の人気タグ:`)
      if (ranking.popularTags && ranking.popularTags.length > 0) {
        ranking.popularTags.forEach((tag, i) => {
          console.log(`  ${i + 1}. ${tag}`)
        })
      } else {
        console.log('  （人気タグなし）')
      }
    } catch (error) {
      console.error(`❌ ${genreId}のエラー:`, error.message)
    }
  }
}

testCompleteSystem().catch(console.error)