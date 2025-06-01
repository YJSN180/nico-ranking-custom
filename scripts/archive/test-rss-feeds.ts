// 例のソレジャンルのRSSフィードをテスト

async function testRSSFeeds() {
  console.log('=== 例のソレジャンルRSSフィードテスト ===\n')
  
  const rssUrls = [
    // 例のソレ 24時間ランキング
    {
      name: '例のソレ 24時間',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&rss=2.0&lang=ja-jp'
    },
    // 例のソレ 毎時ランキング
    {
      name: '例のソレ 毎時',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=hour&rss=2.0&lang=ja-jp'
    },
    // 例のソレ MMDタグ
    {
      name: '例のソレ MMDタグ',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=MMD&rss=2.0&lang=ja-jp'
    },
    // 例のソレ R-18タグ
    {
      name: '例のソレ R-18タグ',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=R-18&rss=2.0&lang=ja-jp'
    },
    // 比較用：その他ジャンル
    {
      name: 'その他 24時間',
      url: 'https://www.nicovideo.jp/ranking/genre/ramuboyn?term=24h&rss=2.0&lang=ja-jp'
    }
  ]
  
  for (const rssInfo of rssUrls) {
    console.log(`\n=== ${rssInfo.name} ===`)
    console.log(`URL: ${rssInfo.url}`)
    
    try {
      // Googlebotとして取得
      const response = await fetch(rssInfo.url, {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      })
      
      console.log(`Status: ${response.status}`)
      console.log(`Content-Type: ${response.headers.get('content-type')}`)
      
      if (response.status === 200) {
        const xml = await response.text()
        
        // XMLのサイズ
        console.log(`XML size: ${xml.length} bytes`)
        
        // titleタグを確認
        const titleMatch = xml.match(/<title>([^<]+)<\/title>/)
        if (titleMatch) {
          console.log(`Feed title: ${titleMatch[1]}`)
        }
        
        // チャンネルのlinkを確認
        const linkMatch = xml.match(/<channel>[\s\S]*?<link>([^<]+)<\/link>/)
        if (linkMatch) {
          console.log(`Channel link: ${linkMatch[1]}`)
        }
        
        // itemの数を確認
        const items = xml.match(/<item>/g)
        if (items) {
          console.log(`Items count: ${items.length}`)
          
          // 最初のアイテムを詳しく確認
          const firstItemMatch = xml.match(/<item>([\s\S]*?)<\/item>/)
          if (firstItemMatch) {
            const firstItem = firstItemMatch[1]
            
            // タイトル
            const itemTitleMatch = firstItem.match(/<title>([^<]+)<\/title>/)
            if (itemTitleMatch) {
              console.log(`\nFirst item:`)
              console.log(`Title: ${itemTitleMatch[1]}`)
              
              // R-18やMMD関連のキーワードをチェック
              if (itemTitleMatch[1].includes('R-18') || 
                  itemTitleMatch[1].includes('紳士') ||
                  itemTitleMatch[1].includes('MMD')) {
                console.log('⭐ 例のソレコンテンツです！')
              }
            }
            
            // リンク
            const itemLinkMatch = firstItem.match(/<link>([^<]+)<\/link>/)
            if (itemLinkMatch) {
              console.log(`Link: ${itemLinkMatch[1]}`)
              
              // 動画IDを抽出
              const videoIdMatch = itemLinkMatch[1].match(/(sm|nm|so)\d+/)
              if (videoIdMatch) {
                console.log(`Video ID: ${videoIdMatch[0]}`)
              }
            }
            
            // カテゴリ
            const categoryMatch = firstItem.match(/<category>([^<]+)<\/category>/)
            if (categoryMatch) {
              console.log(`Category: ${categoryMatch[1]}`)
            }
          }
        } else {
          console.log('❌ No items found in RSS')
        }
        
        // RSSを保存（後で詳しく分析）
        if (rssInfo.name === '例のソレ MMDタグ') {
          const fs = await import('fs')
          fs.writeFileSync('d2um7mc4-mmd-rss.xml', xml)
          console.log('\n💾 例のソレMMDタグのRSSを保存しました')
        }
      } else if (response.status === 403) {
        console.log('❌ 403 Forbidden - 地理的制限')
      } else {
        console.log('❌ 取得失敗')
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // 通常のUser-Agentでも試す
  console.log('\n\n=== 通常のUser-Agentでの取得 ===')
  const testUrl = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&rss=2.0&lang=ja-jp'
  
  try {
    const response = await fetch(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    })
    
    console.log(`Status: ${response.status}`)
    
    if (response.status === 200) {
      const xml = await response.text()
      const items = xml.match(/<item>/g)
      console.log(`Items count: ${items?.length || 0}`)
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

testRSSFeeds().catch(console.error)