// 「もっと見る」ボタンのロジックを検証

// 300件のテストデータ
const mockItems = Array.from({ length: 300 }, (_, i) => ({
  rank: i + 1,
  id: `sm${i + 1}`,
  title: `テスト動画 ${i + 1}`,
  views: 1000 * (i + 1)
}))

// client-page.tsxのロジックをシミュレート
const realtimeItems = mockItems // useRealtimeStatsの結果
const displayCount = 100 // 初期表示数

console.log('=== 「もっと見る」ボタン表示ロジックの検証 ===')
console.log(`realtimeItems.length: ${realtimeItems.length}`)
console.log(`displayCount: ${displayCount}`)
console.log(`条件式 (displayCount < realtimeItems.length): ${displayCount < realtimeItems.length}`)

if (displayCount < realtimeItems.length) {
  console.log('\n✅ ボタンが表示されるはずです！')
  console.log(`ボタンテキスト: もっと見る（${displayCount} / ${realtimeItems.length}件）`)
} else {
  console.log('\n❌ ボタンは表示されません')
}

// 表示されるアイテム
const displayItems = realtimeItems.slice(0, displayCount)
console.log(`\n表示アイテム数: ${displayItems.length}`)

// ボタンクリック後のシミュレーション
const newDisplayCount = Math.min(displayCount + 100, realtimeItems.length)
console.log(`\nボタンクリック後の表示数: ${newDisplayCount}`)

// 2回クリック後
const afterTwoClicks = Math.min(200 + 100, realtimeItems.length)
console.log(`2回クリック後の表示数: ${afterTwoClicks}`)
console.log(`全件表示: ${afterTwoClicks === realtimeItems.length}`)