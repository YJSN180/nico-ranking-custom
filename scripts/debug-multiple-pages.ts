async function debugMultiplePages() {
  console.log('=== ニコニコランキングのページング調査 ===')
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'ja',
    'Cookie': 'sensitive_material_status=accept'
  }
  
  // 1. ページ2を試してみる
  console.log('\n1. ページ2の存在確認...')
  const urls = [
    'https://www.nicovideo.jp/ranking/genre/all?term=24h&page=2',
    'https://www.nicovideo.jp/ranking/genre/all?term=24h&offset=100',
    'https://www.nicovideo.jp/ranking/genre/all?term=24h&from=101',
  ]
  
  for (const url of urls) {
    console.log(`\n試行: ${url}`)
    try {
      const response = await fetch(url, { headers })
      const html = await response.text()
      
      // server-responseメタタグを探す
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      if (metaMatch) {
        const encodedData = metaMatch[1]!
        const decodedData = encodedData
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
        
        const serverData = JSON.parse(decodedData)
        const rankingData = serverData.data?.response?.$getTeibanRanking?.data
        
        if (rankingData?.items?.length > 0) {
          console.log(`✅ データ取得成功: ${rankingData.items.length}件`)
          console.log(`最初の動画: ${rankingData.items[0]?.title}`)
          console.log(`ランク: ${rankingData.items[0]?.rank || 'なし'}`)
        } else {
          console.log('❌ ランキングデータなし')
        }
      } else {
        console.log('❌ server-responseメタタグなし')
      }
    } catch (error) {
      console.log(`❌ エラー: ${error}`)
    }
  }
  
  // 2. nvAPIを使った方法を調査
  console.log('\n\n2. nvAPIでの取得方法調査...')
  const nvApiUrls = [
    'https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h&offset=100',
    'https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h&page=2',
    'https://nvapi.nicovideo.jp/v1/ranking/genre/all?term=24h&from=101&to=200',
  ]
  
  for (const url of nvApiUrls) {
    console.log(`\n試行: ${url}`)
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'ja,en;q=0.9',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Referer': 'https://www.nicovideo.jp/',
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.data?.items?.length > 0) {
          console.log(`✅ データ取得成功: ${data.data.items.length}件`)
          console.log(`最初の動画: ${data.data.items[0]?.title}`)
        } else {
          console.log('❌ アイテムなし')
        }
      } else {
        console.log(`❌ HTTPエラー: ${response.status}`)
      }
    } catch (error) {
      console.log(`❌ エラー: ${error}`)
    }
  }
  
  // 3. RSSフィードを確認
  console.log('\n\n3. RSSフィードの確認...')
  try {
    const rssUrl = 'https://www.nicovideo.jp/ranking/genre/all?term=24h&rss=2.0&lang=ja-jp'
    const response = await fetch(rssUrl, { headers })
    const text = await response.text()
    const itemCount = (text.match(/<item>/g) || []).length
    console.log(`RSSフィードのアイテム数: ${itemCount}件`)
  } catch (error) {
    console.log(`❌ RSSエラー: ${error}`)
  }
}

debugMultiplePages().then(() => {
  console.log('\n=== 調査完了 ===')
})