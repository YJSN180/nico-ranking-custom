// 様々なアプローチで例のソレジャンルのデータ取得を試みる

async function tryDifferentApproaches() {
  console.log('=== 例のソレジャンル データ取得テスト ===\n')
  
  const testCases = [
    {
      name: 'SP版 + Googlebot',
      url: 'https://sp.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=MMD',
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja'
      }
    },
    {
      name: '通常版 + モバイルUA',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=MMD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml'
      }
    },
    {
      name: '通常版 + Cookie認証',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=MMD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': 'user_session=user_session_54116935_56e7cd07bafc0c91b4e87baec017fe86bc64e014cf01c1f5cf07eaf02f0503f6; sensitive_material_status=accept',
        'Accept': 'text/html,application/xhtml+xml'
      }
    },
    {
      name: 'タグなしURL',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h',
      headers: {
        'User-Agent': 'Googlebot/2.1',
        'Accept': 'text/html,application/xhtml+xml'
      }
    }
  ]
  
  for (const testCase of testCases) {
    console.log(`\n=== ${testCase.name} ===`)
    console.log(`URL: ${testCase.url}`)
    
    try {
      const response = await fetch(testCase.url, { headers: testCase.headers })
      console.log(`Status: ${response.status}`)
      console.log(`Final URL: ${response.url}`)
      
      if (response.status === 200) {
        const html = await response.text()
        
        // タイトルを確認
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
        if (titleMatch) {
          console.log(`Page title: ${titleMatch[1]}`)
        }
        
        // RemixContextを探す
        const remixMatch = html.match(/<script id="__remix-context__"[^>]*>([^<]+)<\/script>/)
        if (remixMatch) {
          console.log('✅ RemixContext found')
          try {
            const remixData = JSON.parse(remixMatch[1])
            const loaderData = remixData?.state?.loaderData
            
            if (loaderData) {
              // 各ルートのデータを確認
              Object.entries(loaderData).forEach(([routeId, data]: [string, any]) => {
                if (data?.rankingItems || data?.items || data?.videos) {
                  console.log(`\n📦 Route: ${routeId}`)
                  
                  // 動画データを探す
                  const items = data.rankingItems || data.items || data.videos
                  if (Array.isArray(items) && items.length > 0) {
                    console.log(`Found ${items.length} items`)
                    
                    // 最初の3件を表示
                    items.slice(0, 3).forEach((item: any, i: number) => {
                      const video = item.video || item
                      if (video.title) {
                        console.log(`${i + 1}. ${video.title}`)
                        if (video.title.includes('MMD') || video.title.includes('R-18')) {
                          console.log('   ⭐ 例のソレコンテンツの可能性！')
                        }
                      }
                    })
                  }
                }
              })
            }
          } catch (e) {
            console.log('RemixContext parse error')
          }
        }
        
        // meta server-responseも確認
        const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
        if (metaMatch) {
          const decodedData = metaMatch[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
          
          try {
            const jsonData = JSON.parse(decodedData)
            const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
            
            if (rankingData) {
              console.log(`\n📊 Meta tag data:`)
              console.log(`Label: ${rankingData.label}`)
              console.log(`Tag: ${rankingData.tag || 'なし'}`)
              
              // 例のソレ特有のコンテンツを探す
              if (rankingData.items) {
                const sensitiveItems = rankingData.items.filter((item: any) => 
                  item.requireSensitiveMasking || 
                  item['9d091f87'] ||
                  (item.title && (item.title.includes('R-18') || item.title.includes('MMD')))
                )
                
                if (sensitiveItems.length > 0) {
                  console.log(`\n🔞 センシティブコンテンツ ${sensitiveItems.length}件:`)
                  sensitiveItems.slice(0, 3).forEach((item: any, i: number) => {
                    console.log(`${i + 1}. ${item.title} (${item.id})`)
                  })
                }
              }
            }
          } catch (e) {
            // ignore
          }
        }
        
        // 特定のキーワードを確認
        const keywords = ['メスガキ', 'MMDポケモン', 'ダイナミック', '紳士向け']
        const foundKeywords = keywords.filter(kw => html.includes(kw))
        if (foundKeywords.length > 0) {
          console.log(`\n✨ 発見したキーワード: ${foundKeywords.join(', ')}`)
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
}

tryDifferentApproaches().catch(console.error)