// 前回成功した可能性のあるパターンを再現

async function reproduceSuccess() {
  console.log('=== 成功パターン再現テスト ===\n')
  
  // 前回の会話で見つけた人気タグ（deep-dive-loader-data.tsの結果より）
  const reiSoreTags = ["R-18", "紳士向け", "MMD", "ボイロAV"]
  
  // SP版のURLパターン
  for (const tag of reiSoreTags) {
    console.log(`\n=== SP版 例のソレ ${tag}タグ ===`)
    const spUrl = `https://sp.nicovideo.jp/ranking/genre/d2um7mc4?term=24h&tag=${encodeURIComponent(tag)}`
    
    try {
      const response = await fetch(spUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja',
          'Cookie': 'sensitive_material_status=accept'
        }
      })
      
      console.log(`URL: ${spUrl}`)
      console.log(`Status: ${response.status}`)
      console.log(`Final URL: ${response.url}`)
      
      if (response.status === 200) {
        const html = await response.text()
        
        // HTMLを保存（後で分析用）
        if (tag === 'MMD') {
          const fs = await import('fs')
          fs.writeFileSync('sp-d2um7mc4-mmd-detailed.html', html)
          console.log('💾 MMDタグのHTMLを保存しました')
        }
        
        // RemixContextを確認
        const remixMatch = html.match(/<script>window\.__remixContext\s*=\s*({[^<]+})<\/script>/)
        if (remixMatch) {
          console.log('✅ RemixContext found (old format)')
          try {
            const remixData = JSON.parse(remixMatch[1])
            console.log('RemixContext keys:', Object.keys(remixData))
          } catch (e) {
            console.log('Parse error')
          }
        }
        
        // 別の形式のRemixContext
        const remixMatch2 = html.match(/<script id="__remix-context__"[^>]*>([^<]+)<\/script>/)
        if (remixMatch2) {
          console.log('✅ RemixContext found (new format)')
        }
        
        // 動画IDパターンを探す
        const videoIds = html.match(/(?:sm|nm|so)\d{5,}/g)
        if (videoIds) {
          const uniqueIds = [...new Set(videoIds)]
          console.log(`動画ID数: ${uniqueIds.length}`)
          
          // MMD関連の動画を探す
          const mmdPattern = /【MMD[^】]*】[^<]+/g
          const mmdTitles = html.match(mmdPattern)
          if (mmdTitles) {
            console.log(`\nMMD動画タイトル:`)
            mmdTitles.slice(0, 3).forEach((title, i) => {
              console.log(`${i + 1}. ${title}`)
            })
          }
        }
        
        // 特定のキーワードを確認
        if (html.includes('メスガキ')) {
          console.log('⭐ 「メスガキ」キーワード発見！')
          
          // メスガキの周辺テキストを抽出
          const mesuIndex = html.indexOf('メスガキ')
          const context = html.substring(mesuIndex - 100, mesuIndex + 100)
          console.log('Context:', context.replace(/[<>]/g, ' '))
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // 通常版のtag引数なしも試す
  console.log('\n\n=== 通常版 例のソレ（タグなし） ===')
  const plainUrl = 'https://www.nicovideo.jp/ranking/genre/d2um7mc4'
  
  try {
    const response = await fetch(plainUrl, {
      headers: {
        'User-Agent': 'Googlebot/2.1',
        'Accept': 'text/html,application/xhtml+xml'
      }
    })
    
    console.log(`URL: ${plainUrl}`)
    console.log(`Status: ${response.status}`)
    console.log(`Final URL: ${response.url}`)
    
    if (response.url === plainUrl) {
      console.log('✨ リダイレクトされませんでした！')
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

reproduceSuccess().catch(console.error)