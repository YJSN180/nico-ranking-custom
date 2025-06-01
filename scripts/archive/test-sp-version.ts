// SP版のニコニコ動画から例のソレジャンルを取得

async function testSPVersion() {
  // SP版のURL
  const spUrl = 'https://sp.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=MMD'
  
  console.log('=== SP版ニコニコ動画テスト ===')
  console.log(`URL: ${spUrl}`)
  
  try {
    // 1. Googlebotで試す
    console.log('\n1. Googlebot User-Agent:')
    const response1 = await fetch(spUrl, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja'
      }
    })
    
    console.log(`Status: ${response1.status}`)
    console.log(`Final URL: ${response1.url}`)
    
    if (response1.status === 200) {
      const html = await response1.text()
      console.log(`HTML length: ${html.length}`)
      
      // タイトルタグ
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
      if (titleMatch) {
        console.log(`Page title: ${titleMatch[1]}`)
      }
      
      // meta server-response
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      if (metaMatch) {
        console.log('✅ server-response meta tag found')
        const decodedData = metaMatch[1]
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
              console.log('\n最初の3件:')
              rankingData.items.slice(0, 3).forEach((item: any, i: number) => {
                console.log(`${i + 1}. ${item.title} (${item.id})`)
                console.log(`   センシティブ: ${item.requireSensitiveMasking}`)
              })
            }
          }
        } catch (e) {
          console.log('JSON parse error')
        }
      } else {
        console.log('❌ server-response meta tag not found')
      }
      
      // RemixContext を探す
      const remixMatch = html.match(/<script id="__remix-context__"[^>]*>([^<]+)<\/script>/)
      if (remixMatch) {
        console.log('\n✅ RemixContext found')
        try {
          const remixData = JSON.parse(remixMatch[1])
          const loaderData = remixData?.state?.loaderData
          
          if (loaderData) {
            console.log('Routes in loaderData:')
            Object.keys(loaderData).forEach(key => {
              console.log(`  - ${key}`)
              const data = loaderData[key]
              if (data?.ranking || data?.rankingItems || data?.items) {
                console.log(`    → Contains ranking data`)
              }
            })
          }
        } catch (e) {
          console.log('RemixContext parse error')
        }
      }
      
      // HTMLファイルを保存
      const fs = await import('fs')
      fs.writeFileSync('sp-d2um7mc4-mmd.html', html)
      console.log('\n💾 HTMLを sp-d2um7mc4-mmd.html に保存しました')
    }
    
    // 2. 通常版URLも比較
    console.log('\n\n2. 通常版URL比較:')
    const normalUrl = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=MMD'
    const response2 = await fetch(normalUrl, {
      headers: {
        'User-Agent': 'Googlebot/2.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja'
      }
    })
    
    console.log(`Normal URL status: ${response2.status}`)
    console.log(`Normal URL final: ${response2.url}`)
    
  } catch (error) {
    console.error('Error:', error)
  }
}

testSPVersion().catch(console.error)