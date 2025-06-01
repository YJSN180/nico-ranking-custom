// sp.nicovideo.jp経由で例のソレジャンルのランキングを取得

async function testSpReiSoreRanking() {
  console.log('=== sp.nicovideo.jp経由 例のソレランキング取得テスト ===\n')
  console.log(new Date().toLocaleString('ja-JP'))
  console.log('\n')
  
  const urls = [
    {
      name: '例のソレ SP版 総合',
      url: 'https://sp.nicovideo.jp/ranking/genre/d2um7mc4'
    },
    {
      name: '例のソレ SP版 毎時',
      url: 'https://sp.nicovideo.jp/ranking/genre/d2um7mc4?term=hour'
    },
    {
      name: '例のソレ SP版 24時間',
      url: 'https://sp.nicovideo.jp/ranking/genre/d2um7mc4?term=24h'
    },
    {
      name: '例のソレ SP版 R-18タグ',
      url: 'https://sp.nicovideo.jp/ranking/genre/d2um7mc4?tag=R-18'
    },
    {
      name: '比較：総合 SP版',
      url: 'https://sp.nicovideo.jp/ranking/genre/all'
    }
  ]
  
  for (const urlInfo of urls) {
    console.log(`\n=== ${urlInfo.name} ===`)
    console.log(`URL: ${urlInfo.url}`)
    
    try {
      // 複数のUser-Agentを試す
      const userAgents = [
        {
          name: 'Mobile Safari',
          value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
        },
        {
          name: 'Googlebot',
          value: 'Googlebot/2.1 (+http://www.google.com/bot.html)'
        },
        {
          name: 'Chrome + Cookie',
          value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          cookie: 'sensitive_material_status=accept'
        }
      ]
      
      for (const ua of userAgents) {
        console.log(`\n--- ${ua.name} ---`)
        
        const headers: any = {
          'User-Agent': ua.value,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja'
        }
        
        if (ua.cookie) {
          headers['Cookie'] = ua.cookie
        }
        
        const response = await fetch(urlInfo.url, { headers })
        
        console.log(`Status: ${response.status}`)
        
        if (response.status === 200) {
          const html = await response.text()
          
          // ページタイトルを確認
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
          if (titleMatch) {
            console.log(`Page title: ${titleMatch[1]}`)
          }
          
          // リダイレクトされたか確認
          if (html.includes('総合') && urlInfo.name.includes('例のソレ')) {
            console.log('⚠️ 総合ランキングにリダイレクトされた可能性')
          }
          
          // JSONデータを探す
          const scriptTags = html.matchAll(/<script[^>]*>([^<]+)<\/script>/g)
          let rankingData = null
          
          for (const match of scriptTags) {
            const scriptContent = match[1]
            
            // window.__INITIAL_STATE__ や window.__DATA__ などを探す
            if (scriptContent.includes('__INITIAL_STATE__') || scriptContent.includes('__DATA__')) {
              console.log('📊 初期データ発見')
              
              // JSON部分を抽出
              const jsonMatch = scriptContent.match(/window\.__[A-Z_]+__\s*=\s*({[\s\S]+?});/)
              if (jsonMatch) {
                try {
                  rankingData = JSON.parse(jsonMatch[1])
                  console.log('✅ JSONデータを解析成功')
                  break
                } catch (e) {
                  console.log('❌ JSON解析エラー')
                }
              }
            }
          }
          
          // ランキングアイテムを直接HTMLから探す
          const rankingItems = html.matchAll(/<div[^>]*class="[^"]*RankingItem[^"]*"[^>]*>[\s\S]*?<\/div>/g)
          let itemCount = 0
          
          console.log('\nランキングアイテム（HTML直接解析）:')
          for (const match of rankingItems) {
            if (itemCount >= 5) break
            
            const itemHtml = match[0]
            
            // タイトルを探す
            const titleMatch = itemHtml.match(/<a[^>]*title="([^"]+)"/)
            const linkMatch = itemHtml.match(/href="(\/watch\/[^"]+)"/)
            
            if (titleMatch) {
              itemCount++
              console.log(`${itemCount}. ${titleMatch[1]}`)
              
              if (linkMatch) {
                const videoId = linkMatch[1].replace('/watch/', '')
                console.log(`   ID: ${videoId}`)
              }
            }
          }
          
          // SP版特有の要素を探す
          if (html.includes('sp-video-list') || html.includes('sp-ranking')) {
            console.log('\n📱 SP版固有の要素を検出')
          }
          
          // HTMLサンプルを保存
          if (urlInfo.name === '例のソレ SP版 総合' && ua.name === 'Mobile Safari') {
            const fs = await import('fs')
            fs.writeFileSync('sp-reisore-sample.html', html.substring(0, 50000))
            console.log('\n💾 SP版HTMLサンプルを保存しました')
          }
          
          // 成功したら次のURLへ
          if (itemCount > 0) {
            console.log('\n✅ ランキングデータ取得成功！')
            break
          }
        } else if (response.status === 403) {
          console.log('❌ 403 Forbidden')
        } else if (response.status === 404) {
          console.log('❌ 404 Not Found')
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
}

testSpReiSoreRanking().catch(console.error)