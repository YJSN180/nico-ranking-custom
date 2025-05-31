// 内部プロキシAPIのテスト

async function testInternalProxy() {
  console.log('=== 内部プロキシAPIテスト ===\n')
  
  // ローカルサーバーが起動していると仮定
  const baseUrl = 'http://localhost:3000/api/internal-proxy'
  
  const tests = [
    {
      name: '例のソレジャンル 毎時',
      url: `${baseUrl}?genre=d2um7mc4&term=hour`
    },
    {
      name: 'その他ジャンル 毎時',
      url: `${baseUrl}?genre=ramuboyn&term=hour`
    },
    {
      name: '例のソレジャンル R-18タグ',
      url: `${baseUrl}?genre=d2um7mc4&term=hour&tag=R-18`
    }
  ]
  
  for (const test of tests) {
    console.log(`\n=== ${test.name} ===`)
    console.log(`URL: ${test.url}`)
    
    try {
      const response = await fetch(test.url)
      const data = await response.json()
      
      console.log(`Status: ${response.status}`)
      console.log(`ジャンル: ${data.genre} (${data.genreId})`)
      console.log(`リクエストしたジャンル: ${data.requestedGenre}`)
      console.log(`リダイレクト: ${data.isRedirected ? 'はい' : 'いいえ'}`)
      console.log(`アイテム数: ${data.items?.length || 0}`)
      
      if (data.source) {
        console.log(`ソース: ${data.source}`)
      }
      
      if (data.items?.length > 0) {
        console.log('\n最初の3件:')
        data.items.slice(0, 3).forEach((item: any) => {
          console.log(`${item.rank}. ${item.title}`)
          console.log(`   ID: ${item.id}, 再生数: ${item.views}`)
        })
      }
      
      if (data.error) {
        console.log(`エラー: ${data.error}`)
      }
      
    } catch (error) {
      console.error('リクエストエラー:', error)
    }
  }
  
  console.log('\n\n=== プロキシAPIの使い方 ===')
  console.log('1. 開発サーバーを起動: npm run dev')
  console.log('2. APIエンドポイント: /api/internal-proxy')
  console.log('3. パラメータ:')
  console.log('   - genre: ジャンルID (例: d2um7mc4, ramuboyn)')
  console.log('   - term: 期間 (hour, 24h)')
  console.log('   - tag: タグ名 (オプション)')
  console.log('\n4. 例のソレジャンルがリダイレクトされた場合:')
  console.log('   自動的にタグベースRSSから取得を試みます')
}

// 実行
testInternalProxy().catch(console.error)