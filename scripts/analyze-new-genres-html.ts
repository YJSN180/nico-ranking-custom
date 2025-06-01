#!/usr/bin/env tsx

// 新ジャンルのHTMLを直接取得して人気タグを分析

async function analyzeNewGenresHTML() {
  const genres = [
    { id: 'oxzi6bje', name: 'ラジオ' },
    { id: 'ne72lua2', name: '動物' },
    { id: '4w3p65pf', name: 'スポーツ' }
  ]

  for (const genre of genres) {
    console.log(`\n=== ${genre.name}ジャンル (${genre.id}) のHTML分析 ===`)
    
    try {
      const url = `https://www.nicovideo.jp/ranking/genre/${genre.id}?term=24h`
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
        }
      })
      
      if (!response.ok) {
        console.error(`HTTP エラー: ${response.status}`)
        continue
      }
      
      const html = await response.text()
      
      // server-responseからデータ取得
      const serverMatch = html.match(/name="server-response"\s+content="([^"]+)"/)
      if (serverMatch) {
        const decoded = serverMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
        
        try {
          const data = JSON.parse(decoded)
          const props = data.props?.pageProps
          
          // タグ情報を探す
          if (props?.tags) {
            console.log('\n見つかったタグ情報:')
            console.log(JSON.stringify(props.tags, null, 2))
          }
          
          // featuredTagsを探す
          if (props?.featuredTags) {
            console.log('\n注目タグ:')
            props.featuredTags.forEach((tag: any, idx: number) => {
              console.log(`  ${idx + 1}. ${tag.name || tag}`)
            })
          }
          
          // popularTagsを探す
          if (props?.popularTags) {
            console.log('\n人気タグ:')
            props.popularTags.forEach((tag: any, idx: number) => {
              console.log(`  ${idx + 1}. ${tag.name || tag}`)
            })
          }
        } catch (e) {
          console.error('JSONパースエラー:', e)
        }
      }
      
      // HTMLから直接タグ要素を探す
      console.log('\nHTML内のタグ要素を検索...')
      
      // パターン1: タグリンク
      const tagLinks = html.match(/<a[^>]*href="[^"]*\?tag=([^"&]+)[^"]*"[^>]*>([^<]+)<\/a>/g) || []
      const foundTags = new Set<string>()
      
      tagLinks.forEach(link => {
        const match = link.match(/>([^<]+)</)
        if (match && match[1] && match[1] !== 'すべて') {
          foundTags.add(match[1].trim())
        }
      })
      
      if (foundTags.size > 0) {
        console.log('\n見つかったタグリンク:')
        Array.from(foundTags).slice(0, 20).forEach((tag, idx) => {
          console.log(`  ${idx + 1}. ${tag}`)
        })
      }
      
      // パターン2: data-属性でタグ情報を持つ要素
      const dataTagMatches = html.match(/data-tag="([^"]+)"/g) || []
      const dataTags = new Set<string>()
      
      dataTagMatches.forEach(match => {
        const tag = match.match(/data-tag="([^"]+)"/)?.[1]
        if (tag && tag !== 'すべて') {
          dataTags.add(tag)
        }
      })
      
      if (dataTags.size > 0) {
        console.log('\ndata-tag属性のタグ:')
        Array.from(dataTags).slice(0, 20).forEach((tag, idx) => {
          console.log(`  ${idx + 1}. ${tag}`)
        })
      }
      
    } catch (error) {
      console.error('エラー:', error)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

// 実行
analyzeNewGenresHTML().catch(console.error)