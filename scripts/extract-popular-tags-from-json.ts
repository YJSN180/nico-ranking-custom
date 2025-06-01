#!/usr/bin/env tsx

// server-responseのJSONから人気タグを抽出

async function extractPopularTagsFromJSON() {
  const genres = [
    { id: 'oxzi6bje', name: 'ラジオ', key: 'radio' },
    { id: 'ne72lua2', name: '動物', key: 'animal' },
    { id: '4w3p65pf', name: 'スポーツ', key: 'sports' },
    // 既存のジャンルも確認
    { id: 'ramuboyn', name: 'その他', key: 'other' },
    { id: '4eet3ca4', name: 'ゲーム', key: 'game' },
    { id: 'zc49b03a', name: 'アニメ', key: 'anime' }
  ]

  for (const genre of genres) {
    console.log(`\n=== ${genre.name}ジャンル (${genre.id}) ===`)
    
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
      
      // server-responseメタタグを探す
      const serverMatch = html.match(/name="server-response"\s+content="([^"]+)"/)
      if (!serverMatch) {
        console.log('server-responseメタタグが見つかりませんでした')
        continue
      }
      
      // HTMLエンティティをデコード
      const decoded = serverMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
      
      try {
        const serverData = JSON.parse(decoded)
        console.log('\nserver-responseのJSONデータ構造:')
        
        // データ構造を探索
        function findTags(obj: any, path: string = ''): void {
          if (!obj || typeof obj !== 'object') return
          
          // tagやtagsという名前のプロパティを探す
          for (const key of Object.keys(obj)) {
            const currentPath = path ? `${path}.${key}` : key
            
            if (key.toLowerCase().includes('tag')) {
              console.log(`\n見つかったタグ関連データ: ${currentPath}`)
              console.log(JSON.stringify(obj[key], null, 2).slice(0, 500))
            }
            
            // popularTags, featuredTags, relatedTagsなどを探す
            if (key.match(/tag/i) && Array.isArray(obj[key])) {
              console.log(`\nタグ配列発見: ${currentPath}`)
              obj[key].slice(0, 20).forEach((tag: any, idx: number) => {
                if (typeof tag === 'string') {
                  console.log(`  ${idx + 1}. ${tag}`)
                } else if (tag && tag.name) {
                  console.log(`  ${idx + 1}. ${tag.name}`)
                } else if (tag && tag.text) {
                  console.log(`  ${idx + 1}. ${tag.text}`)
                }
              })
            }
            
            // 再帰的に探索
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              findTags(obj[key], currentPath)
            }
          }
        }
        
        findTags(serverData)
        
        // 特定のパスも確認
        const paths = [
          'data.response.$getTeibanRanking.data.tags',
          'data.response.$getTeibanRanking.data.popularTags',
          'data.response.$getTeibanRanking.data.featuredTags',
          'props.pageProps.tags',
          'props.pageProps.popularTags',
          'props.pageProps.featuredTags',
          'data.tags',
          'data.popularTags'
        ]
        
        for (const path of paths) {
          const value = path.split('.').reduce((obj, key) => obj?.[key], serverData)
          if (value) {
            console.log(`\n${path}:`)
            console.log(JSON.stringify(value, null, 2).slice(0, 500))
          }
        }
        
      } catch (e) {
        console.error('JSONパースエラー:', e)
      }
      
    } catch (error) {
      console.error('エラー:', error)
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

// 実行
extractPopularTagsFromJSON().catch(console.error)