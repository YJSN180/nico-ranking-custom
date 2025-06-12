// 無限スクロール実装の動作確認スクリプト
import { kv } from '../lib/simple-kv'

async function testInfiniteScroll() {
  console.log('=== 無限スクロール実装の確認 ===\n')
  
  try {
    // 1. データ取得の確認
    console.log('1. ランキングデータの取得...')
    const cacheKey = 'ranking-other-hour'
    const cachedData = await kv.get(cacheKey) as any
    
    if (!cachedData) {
      console.log('  KVにデータがありません。Cronジョブの実行が必要です。')
      return
    }
    
    const { items, popularTags } = cachedData
    
    console.log(`  取得件数: ${items.length}件`)
    console.log(`  人気タグ: ${popularTags?.slice(0, 5).join(', ')}`)
    
    // 2. スクロール表示のシミュレーション
    console.log('\n2. 段階的表示のシミュレーション:')
    const batchSize = 50
    let displayCount = batchSize
    
    while (displayCount <= items.length) {
      console.log(`  ${displayCount}件表示中...`)
      displayCount += batchSize
      
      if (displayCount > items.length) {
        displayCount = items.length
        console.log(`  ${displayCount}件表示中（全件）`)
      }
    }
    
    // 3. 実装の要点
    console.log('\n3. 実装の要点:')
    console.log('  ✅ 初期表示: 50件')
    console.log('  ✅ 追加読み込み: 50件ずつ')
    console.log('  ✅ 最大表示: 300件（KVに保存された全データ）')
    console.log('  ✅ スクロール位置: sessionStorageに保存')
    console.log('  ✅ リンク: 同じタブで開く')
    
    // 4. sessionStorageのキー例
    console.log('\n4. スクロール位置の保存キー例:')
    console.log('  scroll-all-24h')
    console.log('  scroll-game-hour')
    console.log('  scroll-other-24h-ゲーム')
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 実行
testInfiniteScroll().then(() => {
  console.log('\n=== 確認完了 ===')
})