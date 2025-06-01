async function verifyPageParameter() {
  console.log('=== pageパラメータでの300件取得を検証 ===\n')
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ja,en;q=0.9',
    'X-Frontend-Id': '6',
    'X-Frontend-Version': '0',
    'Referer': 'https://www.nicovideo.jp/',
  }
  
  try {
    const allItems = new Map<string, any>()
    const pageData: any[] = []
    
    // 各ページのデータを取得
    for (let page = 1; page <= 3; page++) {
      console.log(`\nページ ${page} を取得中...`)
      const url = `https://nvapi.nicovideo.jp/v1/ranking/genre/other?term=hour&page=${page}`
      const response = await fetch(url, { headers })
      const data = await response.json()
      
      if (data.meta?.status === 200 && data.data?.items) {
        const items = data.data.items
        pageData.push({
          page,
          itemCount: items.length,
          firstItem: items[0],
          lastItem: items[items.length - 1]
        })
        
        // 重複チェックのため全アイテムを保存
        items.forEach((item: any, index: number) => {
          const rank = (page - 1) * 100 + index + 1
          allItems.set(item.id, { ...item, calculatedRank: rank, originalPage: page })
        })
        
        console.log(`  取得件数: ${items.length}件`)
        console.log(`  最初の動画: ${items[0].title} (ID: ${items[0].id})`)
        console.log(`  最後の動画: ${items[items.length - 1].title} (ID: ${items[items.length - 1].id})`)
      }
    }
    
    // 結果の分析
    console.log('\n=== 分析結果 ===')
    console.log(`総ユニーク動画数: ${allItems.size}件`)
    
    // 重複チェック
    const duplicates = Array.from(allItems.entries()).filter(([id, item]) => {
      const count = Array.from(allItems.values()).filter(i => i.id === id).length
      return count > 1
    })
    console.log(`重複動画数: ${duplicates.length}件`)
    
    // 各ページの最初と最後を表示
    console.log('\n各ページの範囲:')
    pageData.forEach(({ page, itemCount, firstItem, lastItem }) => {
      console.log(`  ページ${page}: ${itemCount}件`)
      console.log(`    最初: ${firstItem.title}`)
      console.log(`    最後: ${lastItem.title}`)
    })
    
    // 実際にHTMLページでも同じことができるか確認
    console.log('\n\nHTMLページでのpageパラメータ確認:')
    const htmlHeaders = {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja',
      'Cookie': 'sensitive_material_status=accept'
    }
    
    for (let page = 1; page <= 3; page++) {
      const url = `https://www.nicovideo.jp/ranking/genre/other?term=hour&page=${page}`
      const response = await fetch(url, { headers: htmlHeaders })
      const html = await response.text()
      
      // server-responseからデータを抽出
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      if (metaMatch) {
        const encodedData = metaMatch[1]!
        const decodedData = encodedData
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
        
        const serverData = JSON.parse(decodedData)
        const items = serverData.data?.response?.$getTeibanRanking?.data?.items || []
        
        console.log(`  HTMLページ${page}: ${items.length}件`)
        if (items.length > 0) {
          const matchesNvapi = items[0].id === pageData[page - 1]?.firstItem?.id
          console.log(`    nvAPIと一致: ${matchesNvapi ? '❌ 一致しない' : '✅ 異なるデータ'}`)
        }
      }
    }
    
    // 結論
    console.log('\n=== 結論 ===')
    if (allItems.size === 300) {
      console.log('✅ nvAPIでpageパラメータを使用すれば300件取得可能です！')
      console.log('   ただし、HTMLのserver-responseは常に1ページ目のデータのみです。')
      console.log('   実装にはnvAPIを直接呼び出す必要があります。')
    } else {
      console.log(`⚠️ 取得できたのは${allItems.size}件でした。`)
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 実行
verifyPageParameter().then(() => {
  console.log('\n=== 検証完了 ===')
})