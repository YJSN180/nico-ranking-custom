// server-responseメタタグからその他ジャンルのランキングを取得

async function testServerResponseOtherGenre() {
  console.log('=== server-responseメタタグ その他ジャンル取得テスト ===\n')
  
  const url = 'https://www.nicovideo.jp/ranking/genre/ramuboyn?term=hour'
  console.log(`URL: ${url}`)
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja'
      }
    })
    
    console.log(`Status: ${response.status}`)
    
    if (response.status === 200) {
      const html = await response.text()
      
      const serverResponseMatch = html.match(/name="server-response"\s+content="([^"]+)"/)
      if (serverResponseMatch) {
        // HTMLエンティティをデコード
        const decodedContent = serverResponseMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
        
        const serverData = JSON.parse(decodedContent)
        const rankingData = serverData.data?.response?.$getTeibanRanking?.data
        
        if (rankingData) {
          console.log(`\n✅ ランキングデータ取得成功！`)
          console.log(`ジャンル: ${rankingData.label} (${rankingData.featuredKey})`)
          console.log(`アイテム数: ${rankingData.items?.length || 0}`)
          
          console.log('\n最初の5件:')
          rankingData.items?.slice(0, 5).forEach((item: any, i: number) => {
            console.log(`${i + 1}. ${item.title}`)
            console.log(`   ID: ${item.id}`)
            console.log(`   再生数: ${item.count.view.toLocaleString()}`)
          })
          
          // 保存
          const fs = await import('fs')
          fs.writeFileSync('other-genre-ranking.json', JSON.stringify(rankingData, null, 2))
          console.log('\n💾 その他ジャンルランキングを保存しました')
        }
      }
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

testServerResponseOtherGenre().catch(console.error)