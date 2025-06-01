// 例のソレジャンル「すべて」の毎時ランキングを取得

async function getReiSoreAllHourly() {
  console.log('=== 例のソレジャンル「すべて」毎時ランキング ===\n')
  console.log(new Date().toLocaleString('ja-JP'))
  console.log('\n')
  
  // ドキュメントに基づいたRSS URL形式
  // https://www.nicovideo.jp/ranking/genre/{ジャンル名}?tag={タグ名}&term={集計期間}&rss=2.0&lang=ja-jp
  
  const rssUrls = [
    // 例のソレ 毎時「すべて」
    {
      name: '例のソレ 毎時（hour）',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=hour&rss=2.0&lang=ja-jp'
    },
    // 別の期間指定パターンも試す
    {
      name: '例のソレ 毎時（hourly）',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=hourly&rss=2.0&lang=ja-jp'
    },
    // 比較用：総合毎時
    {
      name: '総合 毎時',
      url: 'https://www.nicovideo.jp/ranking/genre/all?term=hour&rss=2.0&lang=ja-jp'
    }
  ]
  
  for (const rssInfo of rssUrls) {
    console.log(`\n=== ${rssInfo.name} ===`)
    console.log(`URL: ${rssInfo.url}`)
    
    try {
      // 複数のUser-Agentを試す
      const userAgents = [
        'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
      
      for (const ua of userAgents) {
        console.log(`\nUser-Agent: ${ua.substring(0, 30)}...`)
        
        const response = await fetch(rssInfo.url, {
          headers: {
            'User-Agent': ua,
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
          }
        })
        
        console.log(`Status: ${response.status}`)
        const contentType = response.headers.get('content-type')
        console.log(`Content-Type: ${contentType}`)
        
        if (response.status === 200) {
          const text = await response.text()
          
          // XMLかHTMLか確認
          if (text.startsWith('<?xml')) {
            console.log('✅ Valid RSS!')
            
            // チャンネルタイトル
            const titleMatch = text.match(/<channel>[\s\S]*?<title>([^<]+)<\/title>/)
            if (titleMatch) {
              console.log(`Channel title: ${titleMatch[1]}`)
            }
            
            // アイテム数
            const items = text.match(/<item>/g)
            console.log(`Items count: ${items?.length || 0}`)
            
            if (items && items.length > 0) {
              // 最初の5件を表示
              const itemRegex = /<item>([\s\S]*?)<\/item>/g
              let match
              let count = 0
              
              console.log('\n最初の5件:')
              while ((match = itemRegex.exec(text)) !== null && count < 5) {
                const itemXml = match[1]
                const title = itemXml.match(/<title>([^<]+)<\/title>/)?.[1] || ''
                const link = itemXml.match(/<link>([^<]+)<\/link>/)?.[1] || ''
                const videoId = link.match(/(sm|nm|so)\d+/)?.[0] || ''
                
                count++
                console.log(`${count}. ${title}`)
                console.log(`   ID: ${videoId}`)
              }
              
              // RSSを保存
              if (rssInfo.name.includes('例のソレ') && items.length > 0) {
                const fs = await import('fs')
                fs.writeFileSync('reisore-hourly-all.xml', text)
                console.log('\n💾 例のソレ毎時ランキングRSSを保存しました')
              }
            }
            
            // 成功したら次のURLへ
            break
          } else if (text.includes('<!DOCTYPE')) {
            console.log('❌ HTML response (not RSS)')
            
            // HTMLのタイトルを確認
            const htmlTitle = text.match(/<title[^>]*>([^<]+)<\/title>/)?.[1]
            if (htmlTitle) {
              console.log(`HTML title: ${htmlTitle}`)
            }
            
            // リダイレクトされたか確認
            if (text.includes('総合') && rssInfo.name.includes('例のソレ')) {
              console.log('⚠️ 総合ランキングにリダイレクトされた可能性')
            }
          } else {
            console.log('❌ Unknown response format')
          }
        } else if (response.status === 404) {
          console.log('❌ 404 Not Found - URLが間違っているか、RSS提供されていない')
        } else if (response.status === 406) {
          console.log('❌ 406 Not Acceptable - User-Agentが拒否された')
        } else if (response.status === 403) {
          console.log('❌ 403 Forbidden - アクセス制限')
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // Cookie付きでも試す
  console.log('\n\n=== Cookie認証付きで再試行 ===')
  const cookieUrl = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=hour&rss=2.0&lang=ja-jp'
  
  try {
    const response = await fetch(cookieUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Cookie': 'sensitive_material_status=accept; user_session=user_session_54116935_56e7cd07bafc0c91b4e87baec017fe86bc64e014cf01c1f5cf07eaf02f0503f6'
      }
    })
    
    console.log(`Cookie付き: Status ${response.status}`)
    
    if (response.status === 200) {
      const text = await response.text()
      if (text.startsWith('<?xml')) {
        console.log('✅ RSS取得成功！')
        const items = text.match(/<item>/g)
        console.log(`Items: ${items?.length || 0}`)
      }
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

getReiSoreAllHourly().catch(console.error)