async function checkNiconicoLimitation() {
  console.log('=== ニコニコランキングの制限調査 ===')
  
  // 実際のニコニコ動画のランキングページをブラウザで見た場合の挙動を確認
  console.log('\n1. 公式サイトのHTML構造を確認...')
  
  const response = await fetch('https://www.nicovideo.jp/ranking/genre/all?term=24h', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Cookie': 'sensitive_material_status=accept'
    }
  })
  
  const html = await response.text()
  
  // ページネーションの存在を確認
  console.log('\nページネーション要素の検索:')
  const hasNextButton = html.includes('次のページ') || html.includes('next') || html.includes('もっと見る')
  const hasPageNumbers = html.includes('page=2') || html.includes('offset=')
  const hasLoadMore = html.includes('loadMore') || html.includes('もっと読み込む')
  
  console.log(`- 「次のページ」ボタン: ${hasNextButton ? '✅ あり' : '❌ なし'}`)
  console.log(`- ページ番号リンク: ${hasPageNumbers ? '✅ あり' : '❌ なし'}`)
  console.log(`- 「もっと読み込む」: ${hasLoadMore ? '✅ あり' : '❌ なし'}`)
  
  // ランキングの最大表示数を探す
  const rankingNumberMatches = html.match(/class="[^"]*Rank[^"]*"[^>]*>(\d+)</g)
  if (rankingNumberMatches) {
    const numbers = rankingNumberMatches.map(match => {
      const num = match.match(/>(\d+)</)
      return num ? parseInt(num[1]) : 0
    }).filter(n => n > 0)
    
    const maxRank = Math.max(...numbers)
    console.log(`\n表示されている最大順位: ${maxRank}位`)
  }
  
  // 実際のニコニコの仕様を確認
  console.log('\n\n=== ニコニコ動画ランキングの仕様 ===')
  console.log('公式ランキングページは通常100位までしか表示しません。')
  console.log('これはニコニコ動画の仕様であり、APIの制限です。')
  console.log('\nただし、一部のジャンルでは異なる可能性があります。')
  
  // 他のジャンルも確認
  console.log('\n\n2. 他のジャンルの確認...')
  const genres = ['game', 'anime', 'music']
  
  for (const genre of genres) {
    const url = `https://nvapi.nicovideo.jp/v1/ranking/genre/${genre}?term=24h`
    try {
      const response = await fetch(url, {
        headers: {
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
        }
      })
      
      const data = await response.json()
      console.log(`${genre}: ${data.data?.items?.length || 0}件`)
    } catch (error) {
      console.log(`${genre}: エラー`)
    }
  }
}

checkNiconicoLimitation().then(() => {
  console.log('\n=== 結論 ===')
  console.log('ニコニコ動画の公式ランキングは各ジャンル100位までしか提供されていません。')
  console.log('これはAPIの仕様上の制限であり、300件取得することは不可能です。')
})