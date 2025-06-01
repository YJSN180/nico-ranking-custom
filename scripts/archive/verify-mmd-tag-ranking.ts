// 例のソレジャンルのMMDタグランキングを検証

async function verifyMMDRanking() {
  const url = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=MMD'
  
  console.log('=== 例のソレジャンル MMDタグ検証 ===')
  console.log(`URL: ${url}`)
  console.log(`\n実際のランキングページ: https://sp.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=MMD`)
  console.log('↑このURLをブラウザで確認してください\n')
  
  // Cookie認証情報を使用
  const cookies = [
    'nicosid=1748556307.3813877752',
    'user_session=user_session_54116935_56e7cd07bafc0c91b4e87baec017fe86bc64e014cf01c1f5cf07eaf02f0503f6',
    'sensitive_material_status=accept'
  ].join('; ')
  
  try {
    // まずGooglebotで試す
    console.log('1. Googlebot User-Agentでの取得:')
    const googlebotResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Cookie': cookies
      }
    })
    
    console.log(`Status: ${googlebotResponse.status}`)
    console.log(`Final URL: ${googlebotResponse.url}`)
    
    if (googlebotResponse.status === 200) {
      const html = await googlebotResponse.text()
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      if (metaMatch) {
        const decodedData = metaMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
        
        const jsonData = JSON.parse(decodedData)
        const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
        
        console.log(`Label: ${rankingData?.label}`)
        console.log(`Tag: ${rankingData?.tag || 'なし'}`)
        
        if (rankingData?.items?.length > 0) {
          console.log(`\n取得した動画（上位5件）:`)
          rankingData.items.slice(0, 5).forEach((item: any, index: number) => {
            console.log(`${index + 1}. ${item.title} (${item.id})`)
            console.log(`   再生数: ${item.count?.view?.toLocaleString()}`)
          })
        }
      }
    }
    
    // 通常のブラウザUser-Agentでも試す
    console.log('\n\n2. 通常のブラウザUser-Agentでの取得:')
    const browserResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Cookie': cookies
      }
    })
    
    console.log(`Status: ${browserResponse.status}`)
    console.log(`Final URL: ${browserResponse.url}`)
    
    if (browserResponse.status === 200) {
      const html = await browserResponse.text()
      
      // titleタグで確認
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
      if (titleMatch) {
        console.log(`Page title: ${titleMatch[1]}`)
      }
      
      // 動画IDの存在確認
      const videoIds = html.match(/sm\d{5,}/g)
      if (videoIds) {
        const uniqueIds = [...new Set(videoIds)]
        console.log(`\n見つかった動画ID（最初の5件）:`)
        uniqueIds.slice(0, 5).forEach((id, index) => {
          console.log(`${index + 1}. ${id}`)
        })
      }
    }
    
  } catch (error) {
    console.error('Error:', error)
  }
}

verifyMMDRanking().catch(console.error)