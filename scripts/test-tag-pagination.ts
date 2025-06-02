// タグ別ランキングのページネーション動作テスト

async function testTagPagination() {
  console.log('=== タグ別ランキングのページネーションテスト ===\n')
  
  const genre = 'other'
  const period = '24h'
  const tag = 'インタビューシリーズ'
  
  try {
    // ページ1を取得
    console.log('ページ1を取得中...')
    const page1Url = `http://localhost:3000/api/ranking?genre=${genre}&period=${period}&tag=${encodeURIComponent(tag)}&page=1`
    const res1 = await fetch(page1Url)
    const data1 = await res1.json()
    
    console.log(`\nページ1結果:`)
    if (Array.isArray(data1)) {
      console.log(`  アイテム数: ${data1.length}件`)
      if (data1.length > 0) {
        console.log(`  1件目: ${data1[0].title} (ランク${data1[0].rank})`)
        console.log(`  最後: ${data1[data1.length - 1].title} (ランク${data1[data1.length - 1].rank})`)
      }
    } else {
      console.log('  エラー: 配列ではないレスポンス')
    }
    
    // ページ2を取得
    console.log('\nページ2を取得中...')
    const page2Url = `http://localhost:3000/api/ranking?genre=${genre}&period=${period}&tag=${encodeURIComponent(tag)}&page=2`
    const res2 = await fetch(page2Url)
    const data2 = await res2.json()
    
    console.log(`\nページ2結果:`)
    if (Array.isArray(data2)) {
      console.log(`  アイテム数: ${data2.length}件`)
      if (data2.length > 0) {
        console.log(`  1件目: ${data2[0].title} (ランク${data2[0].rank})`)
        console.log(`  最後: ${data2[data2.length - 1].title} (ランク${data2[data2.length - 1].rank})`)
        
        // ランク番号が正しく継続しているか確認
        const firstRankPage2 = data2[0].rank
        const lastRankPage1 = data1[data1.length - 1]?.rank || 0
        console.log(`\n  ランクの連続性チェック:`)
        console.log(`    ページ1最後: ${lastRankPage1}`)
        console.log(`    ページ2最初: ${firstRankPage2}`)
        console.log(`    連続性: ${firstRankPage2 === lastRankPage1 + 1 ? '✅ OK' : '❌ NG'}`)
      }
    } else {
      console.log('  エラー: 配列ではないレスポンス')
    }
    
    // ページ3を取得
    console.log('\nページ3を取得中...')
    const page3Url = `http://localhost:3000/api/ranking?genre=${genre}&period=${period}&tag=${encodeURIComponent(tag)}&page=3`
    const res3 = await fetch(page3Url)
    const data3 = await res3.json()
    
    console.log(`\nページ3結果:`)
    if (Array.isArray(data3)) {
      console.log(`  アイテム数: ${data3.length}件`)
      if (data3.length === 0) {
        console.log('  → これ以上データがないため、正常です')
      }
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 開発サーバーが起動していることを前提に実行
testTagPagination().catch(console.error)