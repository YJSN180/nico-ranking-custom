// 動作するRSSフィードを探す

async function findWorkingRSS() {
  console.log('=== 動作するRSSフィードを探す ===\n')
  
  const rssPatterns = [
    // 総合ランキング（これは動作するはず）
    'https://www.nicovideo.jp/ranking/genre/all?term=24h&rss=2.0&lang=ja-jp',
    'https://www.nicovideo.jp/ranking/rss/daily/all',
    'https://www.nicovideo.jp/ranking/rss/hourly/all',
    
    // 例のソレ（別のパターン）
    'https://www.nicovideo.jp/ranking/rss/daily/d2um7mc4',
    'https://www.nicovideo.jp/ranking/rss/hourly/d2um7mc4',
    'https://www.nicovideo.jp/ranking/d2um7mc4?rss=2.0',
    
    // タグ検索RSS
    'https://www.nicovideo.jp/tag/MMD?sort=h&rss=2.0',
    'https://www.nicovideo.jp/tag/R-18?sort=h&rss=2.0',
    
    // 旧形式
    'https://www.nicovideo.jp/ranking/mylist/daily/all?rss=2.0',
    'https://www.nicovideo.jp/ranking/view/daily/all?rss=2.0'
  ]
  
  for (const url of rssPatterns) {
    console.log(`\nTesting: ${url}`)
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Googlebot/2.1',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      })
      
      console.log(`Status: ${response.status}`)
      
      if (response.status === 200) {
        const contentType = response.headers.get('content-type')
        console.log(`Content-Type: ${contentType}`)
        
        const text = await response.text()
        
        // XMLかHTMLか確認
        if (text.startsWith('<?xml')) {
          console.log('✅ Valid XML/RSS')
          
          // タイトルを確認
          const titleMatch = text.match(/<title>([^<]+)<\/title>/)
          if (titleMatch) {
            console.log(`Title: ${titleMatch[1]}`)
          }
          
          // アイテム数
          const items = text.match(/<item>/g)
          console.log(`Items: ${items?.length || 0}`)
          
          // 最初のアイテムのタイトル
          const firstItemTitle = text.match(/<item>[\s\S]*?<title>([^<]+)<\/title>/)
          if (firstItemTitle) {
            console.log(`First item: ${firstItemTitle[1]}`)
          }
        } else if (text.includes('<!DOCTYPE')) {
          console.log('❌ HTML response (not RSS)')
        } else {
          console.log('❌ Unknown response format')
        }
      } else if (response.status === 403) {
        console.log('❌ 403 Forbidden')
      } else if (response.status === 404) {
        console.log('❌ 404 Not Found')
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // ニコログが使っているかもしれないAPI
  console.log('\n\n=== その他のAPIパターン ===')
  
  const apiPatterns = [
    'https://api.nicovideo.jp/v1/ranking/genre/d2um7mc4?term=24h',
    'https://public.api.nicovideo.jp/v1/ranking/genre/d2um7mc4',
    'https://nvapi.nicovideo.jp/v1/tmp/ranking/genre/d2um7mc4?term=24h'
  ]
  
  for (const url of apiPatterns) {
    console.log(`\nTesting API: ${url}`)
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json'
        }
      })
      
      console.log(`Status: ${response.status}`)
    } catch (error) {
      console.error('Error:', error)
    }
  }
}

findWorkingRSS().catch(console.error)