async function checkHtmlRendering() {
  console.log('=== HTML内の実際のランキング表示を確認 ===\n')
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'ja',
    'Cookie': 'sensitive_material_status=accept'
  }
  
  try {
    // page=2のHTMLを取得
    const response = await fetch('https://www.nicovideo.jp/ranking/genre/other?term=hour&page=2', { headers })
    const html = await response.text()
    
    // 1. 動画タイトルとIDを抽出（より広範なパターン）
    console.log('1. HTML内の動画情報を抽出:')
    
    // 複数のパターンで動画情報を探す
    const videoPatterns = [
      // data-video-id属性から
      /data-video-id="([^"]+)"[^>]*>.*?<a[^>]*title="([^"]+)"/gs,
      // VideoItem関連のクラスから
      /<div[^>]*class="[^"]*VideoItem[^"]*"[^>]*>.*?href="\/watch\/([^"]+)".*?title="([^"]+)"/gs,
      // RankingMainContainer内から
      /<a[^>]*href="\/watch\/([^"]+)"[^>]*title="([^"]+)"/gs
    ]
    
    const videos = new Map<string, string>()
    
    for (const pattern of videoPatterns) {
      let match
      while ((match = pattern.exec(html)) !== null) {
        const id = match[1]
        const title = match[2]
        if (id && title && !videos.has(id)) {
          videos.set(id, title)
        }
      }
    }
    
    console.log(`  見つかった動画数: ${videos.size}`)
    if (videos.size > 0) {
      const videoArray = Array.from(videos.entries())
      console.log(`  最初の動画: ${videoArray[0][1]} (${videoArray[0][0]})`)
      console.log(`  最後の動画: ${videoArray[videoArray.length - 1][1]} (${videoArray[videoArray.length - 1][0]})`)
    }
    
    // 2. ページネーション要素を確認
    console.log('\n2. ページネーション要素:')
    const hasPagination = html.includes('class="Pagination"') || html.includes('pagination')
    const hasPage2Active = html.includes('page=2') && (html.includes('active') || html.includes('current'))
    const hasNextPage = html.includes('page=3')
    
    console.log(`  ページネーション要素: ${hasPagination ? '✅ あり' : '❌ なし'}`)
    console.log(`  page=2がアクティブ: ${hasPage2Active ? '✅' : '❌'}`)
    console.log(`  次ページ（page=3）へのリンク: ${hasNextPage ? '✅ あり' : '❌ なし'}`)
    
    // 3. Reactのpropsやstateを確認
    console.log('\n3. React/Next.jsのデータ:')
    
    // __NEXT_DATA__を探す
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1])
        console.log('  __NEXT_DATA__が見つかりました')
        if (nextData.props?.pageProps) {
          console.log('  pagePropsのキー:', Object.keys(nextData.props.pageProps))
        }
      } catch (e) {
        console.log('  __NEXT_DATA__のパースに失敗')
      }
    }
    
    // 4. APIリクエストの形跡を確認
    console.log('\n4. APIエンドポイントの確認:')
    const apiPatterns = [
      /\/api\/[^"'\s]+/g,
      /nvapi\.nicovideo\.jp[^"'\s]+/g,
      /\/v1\/ranking[^"'\s]+/g
    ]
    
    const apis = new Set<string>()
    for (const pattern of apiPatterns) {
      let match
      while ((match = pattern.exec(html)) !== null) {
        apis.add(match[0])
      }
    }
    
    if (apis.size > 0) {
      console.log('  見つかったAPI:')
      apis.forEach(api => console.log(`    ${api}`))
    }
    
    // 5. CSRでの追加読み込みの可能性を確認
    console.log('\n5. クライアントサイドでの追加読み込み:')
    const hasInfiniteScroll = html.includes('InfiniteScroll') || html.includes('infinite-scroll')
    const hasLoadMore = html.includes('loadMore') || html.includes('load-more')
    const hasLazyLoad = html.includes('lazy') || html.includes('LazyLoad')
    
    console.log(`  無限スクロール: ${hasInfiniteScroll ? '✅ あり' : '❌ なし'}`)
    console.log(`  もっと読み込む: ${hasLoadMore ? '✅ あり' : '❌ なし'}`)
    console.log(`  遅延読み込み: ${hasLazyLoad ? '✅ あり' : '❌ なし'}`)
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 実行
checkHtmlRendering().then(() => {
  console.log('\n=== 確認完了 ===')
})