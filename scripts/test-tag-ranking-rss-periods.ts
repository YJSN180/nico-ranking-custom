// タグ検索RSSで各期間のランキングが取得できるか検証

async function testTagRankingRSSPeriods() {
  console.log('=== タグ検索RSS 期間別ランキング取得テスト ===\n')
  console.log(new Date().toLocaleString('ja-JP'))
  console.log('\n')
  
  // 公式ドキュメントに基づくパターンを試す
  const patterns = [
    // パターン1: termパラメータを追加
    {
      name: 'MMDタグ 毎時（term=hour）',
      url: 'https://www.nicovideo.jp/tag/MMD?sort=h&term=hour&rss=2.0'
    },
    {
      name: 'MMDタグ 24時間（term=24h）',
      url: 'https://www.nicovideo.jp/tag/MMD?sort=h&term=24h&rss=2.0'
    },
    {
      name: 'MMDタグ 週間（term=week）',
      url: 'https://www.nicovideo.jp/tag/MMD?sort=h&term=week&rss=2.0'
    },
    {
      name: 'MMDタグ 月間（term=month）',
      url: 'https://www.nicovideo.jp/tag/MMD?sort=h&term=month&rss=2.0'
    },
    
    // パターン2: sortパラメータを変更
    {
      name: 'MMDタグ 再生数順（sort=v）',
      url: 'https://www.nicovideo.jp/tag/MMD?sort=v&rss=2.0'
    },
    
    // パターン3: 期間を含むURL構造
    {
      name: 'MMDタグ ランキング形式URL（/ranking/tag/）',
      url: 'https://www.nicovideo.jp/ranking/tag/MMD?term=24h&rss=2.0'
    },
    
    // パターン4: 公式ランキングRSSと同じ形式
    {
      name: 'ランキングページのタグ指定',
      url: 'https://www.nicovideo.jp/ranking/genre/all?tag=MMD&term=24h&rss=2.0'
    },
    {
      name: '例のソレジャンル タグ指定',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?tag=MMD&term=24h&rss=2.0'
    }
  ]
  
  for (const pattern of patterns) {
    console.log(`\n=== ${pattern.name} ===`)
    console.log(`URL: ${pattern.url}`)
    
    try {
      const response = await fetch(pattern.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      })
      
      console.log(`Status: ${response.status}`)
      const contentType = response.headers.get('content-type')
      console.log(`Content-Type: ${contentType}`)
      
      if (response.status === 200) {
        const text = await response.text()
        
        if (contentType?.includes('rss') || contentType?.includes('xml')) {
          console.log('✅ RSS/XMLレスポンス')
          
          // タイトルと説明を確認
          const titleMatch = text.match(/<title>([^<]+)<\/title>/)
          const descMatch = text.match(/<description>([^<]+)<\/description>/)
          
          if (titleMatch) {
            console.log(`タイトル: ${titleMatch[1]}`)
          }
          if (descMatch) {
            console.log(`説明: ${descMatch[1]}`)
          }
          
          // アイテム数
          const items = text.match(/<item>/g)
          console.log(`アイテム数: ${items?.length || 0}`)
          
          // 最初のアイテムの詳細を確認
          if (items && items.length > 0) {
            const firstItem = text.match(/<item>([\s\S]*?)<\/item>/)
            if (firstItem) {
              const itemXml = firstItem[1]
              const title = itemXml.match(/<title>([^<]+)<\/title>/)?.[1]
              const pubDate = itemXml.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]
              
              console.log(`\n最初のアイテム:`)
              console.log(`- タイトル: ${title}`)
              console.log(`- 投稿日時: ${pubDate}`)
              
              // 期間判定のヒントを探す
              if (pubDate) {
                const date = new Date(pubDate)
                const now = new Date()
                const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
                console.log(`- 現在からの経過時間: ${hoursDiff.toFixed(1)}時間`)
              }
            }
          }
        } else if (text.includes('<!DOCTYPE')) {
          console.log('❌ HTMLレスポンス')
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // 実際のランキングページで使用されているRSSリンクを確認
  console.log('\n\n=== ランキングページのRSSリンクを確認 ===')
  try {
    const response = await fetch('https://www.nicovideo.jp/ranking/genre/all?tag=MMD&term=24h')
    const html = await response.text()
    
    // RSSリンクを探す
    const rssLinks = html.matchAll(/href="([^"]*rss[^"]*)"/g)
    console.log('発見したRSSリンク:')
    for (const match of rssLinks) {
      console.log(`- ${match[1]}`)
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

testTagRankingRSSPeriods().catch(console.error)