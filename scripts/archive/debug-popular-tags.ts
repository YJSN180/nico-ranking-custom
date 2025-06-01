// 人気タグ抽出のデバッグ

async function debugPopularTags() {
  const url = 'https://www.nicovideo.jp/ranking/genre/4eet3ca4?term=24h'
  
  console.log('📡 Fetching:', url)
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja'
    }
  })
  
  const html = await response.text()
  
  // HTMLをファイルに保存
  const fs = await import('fs')
  fs.writeFileSync('game-ranking-html.html', html.substring(0, 50000))
  console.log('💾 HTMLを保存しました')
  
  // 様々なパターンでタグを探す
  console.log('\n=== タグ検索パターン ===')
  
  // パターン1: PopularTag
  const pattern1 = /<a[^>]+class="[^"]*PopularTag[^"]*"[^>]*>([^<]+)</g
  const matches1 = [...html.matchAll(pattern1)]
  console.log(`\nPopularTagクラス: ${matches1.length}件`)
  matches1.slice(0, 5).forEach(m => console.log(`- ${m[1]}`))
  
  // パターン2: tag=パラメータを持つリンク
  const pattern2 = /<a[^>]*href="[^"]*\?tag=([^"&]+)[^"]*"[^>]*>([^<]+)</g
  const matches2 = [...html.matchAll(pattern2)]
  console.log(`\ntag=パラメータ: ${matches2.length}件`)
  matches2.slice(0, 5).forEach(m => console.log(`- ${m[2]} (${decodeURIComponent(m[1])})`))
  
  // パターン3: data-tag属性
  const pattern3 = /data-tag="([^"]+)"/g
  const matches3 = [...html.matchAll(pattern3)]
  console.log(`\ndata-tag属性: ${matches3.length}件`)
  matches3.slice(0, 5).forEach(m => console.log(`- ${m[1]}`))
  
  // パターン4: RankingMainContainer内を探す
  const containerMatch = html.match(/class="[^"]*RankingMainContainer[^"]*"([\s\S]*?)(?=<\/main>|<footer)/i)
  if (containerMatch) {
    console.log('\n✅ RankingMainContainerを発見')
    const container = containerMatch[0]
    
    // タグリストを探す
    const tagListMatch = container.match(/class="[^"]*(?:TagList|tag-list|PopularTags)[^"]*"([\s\S]*?)(?=<\/[^>]+>)/i)
    if (tagListMatch) {
      console.log('✅ タグリストセクションを発見')
      const tagSection = tagListMatch[0]
      const tags = [...tagSection.matchAll(/<a[^>]*>([^<]+)</g)]
      console.log(`タグ数: ${tags.length}`)
      tags.forEach(t => console.log(`- ${t[1]}`))
    }
  }
  
  // パターン5: Remix loaderDataを探す
  const remixMatch = html.match(/window\.__remixContext\s*=\s*({[\s\S]+?});/)
  if (remixMatch) {
    console.log('\n✅ Remixデータを発見')
    try {
      const remixData = JSON.parse(remixMatch[1])
      console.log('loaderData keys:', Object.keys(remixData.state?.loaderData || {}))
    } catch (e) {
      console.error('Remixデータのパースエラー')
    }
  }
}

debugPopularTags().catch(console.error)