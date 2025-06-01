async function testNvapiPagination() {
  console.log('=== nvAPIでのページネーション確認 ===\n')
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ja,en;q=0.9',
    'X-Frontend-Id': '6',
    'X-Frontend-Version': '0',
    'Referer': 'https://www.nicovideo.jp/',
  }
  
  try {
    // 1. 通常のnvAPI呼び出し（pageパラメータなし）
    console.log('1. 通常のnvAPI呼び出し:')
    const url1 = 'https://nvapi.nicovideo.jp/v1/ranking/genre/other?term=hour'
    const response1 = await fetch(url1, { headers })
    const data1 = await response1.json()
    
    console.log(`  ステータス: ${data1.meta?.status}`)
    console.log(`  アイテム数: ${data1.data?.items?.length || 0}`)
    if (data1.data?.items?.length > 0) {
      console.log(`  最初の動画: ${data1.data.items[0].title}`)
      console.log(`  最後の動画: ${data1.data.items[data1.data.items.length - 1].title}`)
    }
    
    // 2. pageパラメータを追加
    console.log('\n2. pageパラメータ付きnvAPI呼び出し:')
    const testParams = [
      { page: 2 },
      { page: 3 },
      { offset: 100 },
      { offset: 200 },
      { limit: 100, offset: 100 },
      { from: 101, to: 200 },
      { start: 100 }
    ]
    
    for (const params of testParams) {
      const paramStr = new URLSearchParams({ term: 'hour', ...params }).toString()
      const url = `https://nvapi.nicovideo.jp/v1/ranking/genre/other?${paramStr}`
      
      try {
        const response = await fetch(url, { headers })
        const data = await response.json()
        
        console.log(`  ${JSON.stringify(params)}: ${data.meta?.status} - ${data.data?.items?.length || 0}件`)
        
        // 最初のアイテムと比較
        if (data.data?.items?.length > 0 && data1.data?.items?.length > 0) {
          const isDifferent = data.data.items[0].id !== data1.data.items[0].id
          console.log(`    異なるデータ: ${isDifferent ? '✅' : '❌'}`)
        }
      } catch (e) {
        console.log(`  ${JSON.stringify(params)}: エラー`)
      }
    }
    
    // 3. 実際にニコニコ動画がどのようにページネーションを実装しているか推測
    console.log('\n3. ニコニコ動画のページネーション実装の可能性:')
    console.log('  A) サーバーサイドレンダリング（SSR）で各ページを生成')
    console.log('  B) クライアントサイドで追加のAPIコールを実行')
    console.log('  C) 初回読み込み時に全データを取得してクライアントでページング')
    console.log('  D) 実はページネーションは存在しない（100件のみ）')
    
    // 4. HTMLのscriptタグ内のデータを確認
    console.log('\n4. HTMLに埋め込まれた追加データの可能性:')
    const pageResponse = await fetch('https://www.nicovideo.jp/ranking/genre/other?term=hour&page=2', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    const html = await pageResponse.text()
    
    // window.__INITIAL_STATE__やその他のグローバル変数を探す
    const statePatterns = [
      /window\.__INITIAL_STATE__\s*=\s*({.*?});/s,
      /window\.__NUXT__\s*=\s*({.*?});/s,
      /window\._initialData\s*=\s*({.*?});/s
    ]
    
    for (const pattern of statePatterns) {
      const match = html.match(pattern)
      if (match) {
        console.log(`  ${pattern.source.split('=')[0]}が見つかりました`)
        try {
          const data = JSON.parse(match[1])
          console.log(`    データサイズ: ${JSON.stringify(data).length}文字`)
        } catch (e) {
          console.log('    パースエラー')
        }
      }
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 実行
testNvapiPagination().then(() => {
  console.log('\n=== 確認完了 ===')
})