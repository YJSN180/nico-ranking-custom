// その他ジャンルの「すべて」ランキングRSSを取得テスト

async function testOtherGenreAllRSS() {
  console.log('=== その他ジャンル「すべて」ランキングRSS ===\n')
  console.log(new Date().toLocaleString('ja-JP'))
  console.log('\n')
  
  // その他ジャンルID: ramuboyn
  const rssUrls = [
    {
      name: 'その他 毎時（hour）',
      url: 'https://www.nicovideo.jp/ranking/genre/ramuboyn?term=hour&rss=2.0&lang=ja-jp'
    },
    {
      name: 'その他 24時間（24h）',
      url: 'https://www.nicovideo.jp/ranking/genre/ramuboyn?term=24h&rss=2.0&lang=ja-jp'
    },
    {
      name: '比較：総合 毎時',
      url: 'https://www.nicovideo.jp/ranking/genre/all?term=hour&rss=2.0&lang=ja-jp'
    }
  ]
  
  for (const rssInfo of rssUrls) {
    console.log(`\n=== ${rssInfo.name} ===`)
    console.log(`URL: ${rssInfo.url}`)
    
    try {
      const response = await fetch(rssInfo.url, {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'ja'
        }
      })
      
      console.log(`Status: ${response.status}`)
      const contentType = response.headers.get('content-type')
      console.log(`Content-Type: ${contentType}`)
      
      if (response.status === 200) {
        const text = await response.text()
        
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
            
            // その他ジャンルのRSSを保存
            if (rssInfo.name.includes('その他') && items.length > 0) {
              const fs = await import('fs')
              fs.writeFileSync('other-genre-all.xml', text)
              console.log('\n💾 その他ジャンル毎時ランキングRSSを保存しました')
            }
          }
        } else if (text.includes('<!DOCTYPE')) {
          console.log('❌ HTML response (not RSS)')
        } else {
          console.log('❌ Unknown response format')
        }
      } else if (response.status === 404) {
        console.log('❌ 404 Not Found')
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
}

testOtherGenreAllRSS().catch(console.error)