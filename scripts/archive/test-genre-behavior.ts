// 例のソレジャンルの挙動をテスト

async function testGenreBehavior() {
  const testCases = [
    // 毎時ランキング
    { genre: 'ramuboyn', term: 'hour', tag: '', desc: 'その他ジャンル 毎時' },
    { genre: 'd2um7mc4', term: 'hour', tag: '', desc: '例のソレジャンル 毎時' },
    
    // 24時間ランキング
    { genre: 'ramuboyn', term: '24h', tag: '', desc: 'その他ジャンル 24時間' },
    { genre: 'd2um7mc4', term: '24h', tag: '', desc: '例のソレジャンル 24時間' },
    
    // タグ付きランキング
    { genre: 'ramuboyn', term: '24h', tag: 'VOICEVOX', desc: 'その他 + VOICEVOX' },
    { genre: 'd2um7mc4', term: '24h', tag: 'MMD', desc: '例のソレ + MMD' },
    { genre: 'd2um7mc4', term: '24h', tag: '東方', desc: '例のソレ + 東方' },
  ]
  
  for (const testCase of testCases) {
    console.log(`\n=== ${testCase.desc} ===`)
    
    let url = `https://www.nicovideo.jp/ranking/genre/${testCase.genre}?term=${testCase.term}`
    if (testCase.tag) {
      url += `&tag=${encodeURIComponent(testCase.tag)}`
    }
    
    console.log(`URL: ${url}`)
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          'Cookie': 'sensitive_material_status=accept'  // Cookieを追加
        }
      })
      
      console.log(`Status: ${response.status}`)
      console.log(`Final URL: ${response.url}`)  // リダイレクト後のURL
      
      if (response.status === 200) {
        const html = await response.text()
        
        // meta tagからジャンル情報を取得
        const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
        if (metaMatch) {
          const encodedData = metaMatch[1]
          const decodedData = encodedData
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
          
          try {
            const jsonData = JSON.parse(decodedData)
            const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
            
            if (rankingData) {
              console.log(`Label: ${rankingData.label}`)
              console.log(`Tag: ${rankingData.tag || 'なし'}`)
              console.log(`Items count: ${rankingData.items?.length || 0}`)
              
              if (rankingData.items?.length > 0) {
                const firstItem = rankingData.items[0]
                console.log(`First video: ${firstItem.title} (${firstItem.id})`)
                console.log(`センシティブ要マスク: ${firstItem.requireSensitiveMasking}`)
              }
            }
          } catch (e) {
            console.log('JSONパースエラー')
          }
        }
        
        // title tagも確認
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
        if (titleMatch) {
          console.log(`Page title: ${titleMatch[1]}`)
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
}

testGenreBehavior().catch(console.error)