// Googlebotとして地理制限を回避してタグランキングを取得

const popularTags = {
  'その他': [
    '拓也さん', '替え歌拓也', '変態糞親父', 'AIのべりすと', 'ゆるキャラ',
    'VOICEVOX', '大規模言語モデル', 'ChatGPT', 'コメディ', 'ご当地グルメ'
  ],
  '例のソレ': [
    'R-18', '紳士向け', 'MMD', 'ボイロAV', '巨乳', 'エロゲ', 'お●ぱい',
    '東方', 'ゲーム実況', 'バーチャルYouTuber'
  ]
}

async function fetchTagRanking(genre: string, tag: string) {
  const url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=24h&tag=${encodeURIComponent(tag)}`
  
  console.log(`Fetching: ${url}`)
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    })
    
    console.log(`Response status: ${response.status}`)
    
    if (!response.ok) {
      console.error('Failed to fetch:', response.status, response.statusText)
      const text = await response.text()
      console.log('Response preview:', text.substring(0, 500))
      return null
    }
    
    const html = await response.text()
    console.log(`HTML length: ${html.length}`)
    
    // デバッグ用: HTMLの一部を表示
    if (html.includes('sm') || html.includes('data-video-id')) {
      const sampleIndex = html.indexOf('data-video-id')
      if (sampleIndex !== -1) {
        console.log('Sample HTML around data-video-id:', html.substring(sampleIndex - 100, sampleIndex + 200))
      }
    }
    
    // センシティブコンテンツの警告をチェック
    if (html.includes('センシティブ') || html.includes('sensitive')) {
      console.log('Found sensitive content warning')
    }
    
    // HTMLから動画情報を抽出
    const items = []
    
    // まずRemixContextからデータを探す
    const remixContextMatch = html.match(/<script id="__remix-context__"[^>]*>([^<]+)<\/script>/)
    if (remixContextMatch) {
      try {
        const contextData = JSON.parse(remixContextMatch[1])
        console.log('Found RemixContext data')
        
        // loaderDataから動画情報を探す
        const loaderData = contextData?.state?.loaderData
        if (loaderData) {
          // 各routeIdを確認
          for (const [routeId, data] of Object.entries(loaderData)) {
            if (data && typeof data === 'object') {
              // rankingItemsを探す
              const rankingItems = (data as any).rankingItems || 
                                 (data as any).data?.rankingItems ||
                                 (data as any).ranking?.items ||
                                 (data as any).items
              
              if (Array.isArray(rankingItems)) {
                console.log(`Found ${rankingItems.length} items in ${routeId}`)
                for (const item of rankingItems.slice(0, 10)) {
                  if (item.video || item.id) {
                    items.push({
                      id: item.video?.id || item.id,
                      title: item.video?.title || item.title,
                      views: item.video?.viewCount || item.viewCount || 0,
                      comments: item.video?.commentCount || item.commentCount || 0,
                      mylists: item.video?.mylistCount || item.mylistCount || 0,
                      likes: item.video?.likeCount || item.likeCount || 0
                    })
                  }
                }
                if (items.length > 0) break
              }
            }
          }
        }
      } catch (error) {
        console.error('Error parsing RemixContext:', error)
      }
    }
    
    // RemixContextから見つからない場合はHTMLから抽出
    if (items.length === 0) {
      console.log('Falling back to HTML parsing')
      
      // 様々なパターンで動画IDを探す
      const patterns = [
        /data-video-id="((?:sm|nm|so)\d+)"/g,
        /\/watch\/((?:sm|nm|so)\d+)/g,
        /contentId":"((?:sm|nm|so)\d+)"/g,
        /"id":"((?:sm|nm|so)\d+)"/g,
        /video\/((?:sm|nm|so)\d+)/g
      ]
      
      const videoIds = []
      for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(html)) !== null) {
          if (match[1] && !videoIds.includes(match[1])) {
            videoIds.push(match[1])
          }
        }
      }
      
      console.log(`Found ${videoIds.length} video IDs`)
      
      // タイトルを探すパターンも追加
      const titlePatterns = [
        /<h3[^>]*class="[^"]*RankingVideo[^"]*"[^>]*>([^<]+)<\/h3>/g,
        /<span[^>]*class="[^"]*VideoTitle[^"]*"[^>]*>([^<]+)<\/span>/g,
        /<a[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/g
      ]
      
      for (const pattern of titlePatterns) {
        let match
        while ((match = pattern.exec(html)) !== null) {
          if (match[1]) {
            console.log('Found title:', match[1])
          }
        }
      }
      
      // 各動画の詳細情報を抽出
      for (const videoId of videoIds.slice(0, 10)) {
        const item: any = {
          id: videoId
        }
        
        // 動画を含むブロックを探す
        const blockPattern = new RegExp(
          `data-video-id="${videoId}"[\\s\\S]*?(?=data-video-id=|</section>|</main>|$)`,
          'i'
        )
        const blockMatch = html.match(blockPattern)
        
        if (blockMatch) {
          const block = blockMatch[0]
          
          // タイトル
          const titleMatch = block.match(/title="([^"]+)"/) || 
                            block.match(/data-title="([^"]+)"/) ||
                            block.match(/<h3[^>]*>([^<]+)<\/h3>/)
          if (titleMatch) {
            item.title = titleMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
          }
          
          // 再生数
          const viewMatch = block.match(/>([\d,]+)\s*再生</) ||
                           block.match(/<span[^>]*>([\d,]+)\s*再生<\/span>/)
          if (viewMatch) {
            item.views = parseInt(viewMatch[1].replace(/,/g, ''), 10)
          }
          
          // コメント数
          const commentMatch = block.match(/>([\d,]+)\s*コメント</) ||
                              block.match(/<span[^>]*>([\d,]+)\s*コメント<\/span>/)
          if (commentMatch) {
            item.comments = parseInt(commentMatch[1].replace(/,/g, ''), 10)
          }
          
          // マイリスト数
          const mylistMatch = block.match(/>([\d,]+)\s*マイリスト</) ||
                             block.match(/<span[^>]*>([\d,]+)\s*マイリスト<\/span>/)
          if (mylistMatch) {
            item.mylists = parseInt(mylistMatch[1].replace(/,/g, ''), 10)
          }
          
          // いいね数
          const likeMatch = block.match(/>([\d,]+)\s*いいね</) ||
                           block.match(/<span[^>]*>([\d,]+)\s*いいね<\/span>/)
          if (likeMatch) {
            item.likes = parseInt(likeMatch[1].replace(/,/g, ''), 10)
          }
        }
        
        if (item.title) {
          items.push(item)
        }
      }
    }
    
    return items
  } catch (error) {
    console.error('Error fetching ranking:', error)
    return null
  }
}

async function getRandomTagRankings() {
  // ランダムにタグを選択
  const otherTag = popularTags['その他'][Math.floor(Math.random() * popularTags['その他'].length)]
  const reiSoreTag = popularTags['例のソレ'][Math.floor(Math.random() * popularTags['例のソレ'].length)]

  console.log(`\n選択されたタグ:`)
  console.log(`その他: ${otherTag}`)
  console.log(`例のソレ: ${reiSoreTag}`)

  // その他ジャンルのタグランキング取得
  console.log(`\n=== その他ジャンル「${otherTag}」の上位10動画 ===`)
  const otherItems = await fetchTagRanking('ramuboyn', otherTag)
  if (otherItems && otherItems.length > 0) {
    otherItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title}`)
      console.log(`   ID: ${item.id}`)
      console.log(`   再生数: ${item.views?.toLocaleString() || 'N/A'}`)
      console.log(`   コメント数: ${item.comments?.toLocaleString() || 'N/A'}`)
      console.log(`   マイリスト数: ${item.mylists?.toLocaleString() || 'N/A'}`)
      console.log(`   いいね数: ${item.likes?.toLocaleString() || 'N/A'}`)
      console.log('')
    })
  } else {
    console.log('動画が見つかりませんでした')
  }

  // 例のソレジャンルのタグランキング取得
  console.log(`\n=== 例のソレジャンル「${reiSoreTag}」の上位10動画 ===`)
  const reiSoreItems = await fetchTagRanking('d2um7mc4', reiSoreTag)
  if (reiSoreItems && reiSoreItems.length > 0) {
    reiSoreItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title}`)
      console.log(`   ID: ${item.id}`)
      console.log(`   再生数: ${item.views?.toLocaleString() || 'N/A'}`)
      console.log(`   コメント数: ${item.comments?.toLocaleString() || 'N/A'}`)
      console.log(`   マイリスト数: ${item.mylists?.toLocaleString() || 'N/A'}`)
      console.log(`   いいね数: ${item.likes?.toLocaleString() || 'N/A'}`)
      console.log('')
    })
  } else {
    console.log('動画が見つかりませんでした')
  }
}

getRandomTagRankings().catch(console.error)