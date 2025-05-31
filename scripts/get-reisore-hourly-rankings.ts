// 例のソレジャンルの人気タグ別毎時ランキングを取得

async function getReiSoreHourlyRankings() {
  console.log('=== 例のソレジャンル 人気タグ別毎時ランキング ===\n')
  console.log(new Date().toLocaleString('ja-JP'))
  console.log('\n')
  
  // 例のソレジャンルの人気タグ
  const popularTags = ['R-18', '紳士向け', 'MMD', 'ボイロAV']
  
  // まず、例のソレジャンル（d2um7mc4）の毎時ランキングRSSを試す
  console.log('=== ジャンル別RSS形式を試す ===')
  for (const tag of popularTags) {
    const genreUrl = `https://www.nicovideo.jp/ranking/genre/d2um7mc4?tag=${encodeURIComponent(tag)}&term=hour&rss=2.0&lang=ja-jp`
    console.log(`\nTrying: ${genreUrl}`)
    
    try {
      const response = await fetch(genreUrl, {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        }
      })
      
      console.log(`Status: ${response.status}`)
      
      if (response.status === 200) {
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('rss') || contentType?.includes('xml')) {
          console.log('✅ RSS取得成功！')
          const xml = await response.text()
          const items = xml.match(/<item>/g)
          console.log(`Items: ${items?.length || 0}`)
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // 次に、タグ検索のRSSで毎時の人気動画を取得
  console.log('\n\n=== タグ検索RSS（更新日時順）で代替 ===')
  
  for (const tag of popularTags) {
    console.log(`\n--- ${tag}タグ 最新動画TOP5 ---`)
    
    const tagUrl = `https://www.nicovideo.jp/tag/${encodeURIComponent(tag)}?sort=h&rss=2.0`
    
    try {
      const response = await fetch(tagUrl, {
        headers: {
          'User-Agent': 'Googlebot/2.1',
          'Accept': 'application/rss+xml'
        }
      })
      
      if (response.status === 200) {
        const xml = await response.text()
        
        // アイテムを解析
        const items = []
        const itemRegex = /<item>([\s\S]*?)<\/item>/g
        let match
        
        while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
          const itemXml = match[1]
          
          const title = itemXml.match(/<title>([^<]+)<\/title>/)?.[1] || ''
          const link = itemXml.match(/<link>([^<]+)<\/link>/)?.[1] || ''
          const description = itemXml.match(/<description>([^<]+)<\/description>/)?.[1] || ''
          const pubDate = itemXml.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] || ''
          
          // 動画IDを抽出
          const videoId = link.match(/(sm|nm|so)\d+/)?.[0] || ''
          
          // descriptionから統計情報を抽出
          const viewsMatch = description.match(/再生：([\d,]+)/)
          const commentsMatch = description.match(/コメント：([\d,]+)/)
          const mylistsMatch = description.match(/マイリスト：([\d,]+)/)
          
          const views = viewsMatch ? parseInt(viewsMatch[1].replace(/,/g, '')) : 0
          const comments = commentsMatch ? parseInt(commentsMatch[1].replace(/,/g, '')) : 0
          const mylists = mylistsMatch ? parseInt(mylistsMatch[1].replace(/,/g, '')) : 0
          
          // 投稿からの経過時間を計算
          const pubTime = new Date(pubDate)
          const now = new Date()
          const hoursAgo = Math.floor((now.getTime() - pubTime.getTime()) / (1000 * 60 * 60))
          
          items.push({
            rank: items.length + 1,
            title,
            videoId,
            views,
            comments,
            mylists,
            hoursAgo,
            pubDate: pubTime.toLocaleString('ja-JP')
          })
        }
        
        // 結果を表示
        items.forEach(item => {
          console.log(`${item.rank}. ${item.title}`)
          console.log(`   ID: ${item.videoId}`)
          console.log(`   再生: ${item.views.toLocaleString()} / コメント: ${item.comments.toLocaleString()} / マイリスト: ${item.mylists.toLocaleString()}`)
          console.log(`   投稿: ${item.pubDate} (${item.hoursAgo}時間前)`)
        })
        
        if (items.length === 0) {
          console.log('   動画が見つかりませんでした')
        }
      } else {
        console.log(`   取得失敗: ${response.status}`)
      }
    } catch (error) {
      console.error(`   エラー:`, error)
    }
  }
  
  // 再生数順のランキングも確認
  console.log('\n\n=== 参考：再生数順TOP3 ===')
  
  for (const tag of popularTags.slice(0, 2)) { // 最初の2つだけ
    console.log(`\n--- ${tag}タグ 再生数順 ---`)
    
    const tagUrl = `https://www.nicovideo.jp/tag/${encodeURIComponent(tag)}?sort=v&rss=2.0`
    
    try {
      const response = await fetch(tagUrl, {
        headers: {
          'User-Agent': 'Googlebot/2.1',
          'Accept': 'application/rss+xml'
        }
      })
      
      if (response.status === 200) {
        const xml = await response.text()
        
        // 最初の3件だけ表示
        const items = []
        const itemRegex = /<item>([\s\S]*?)<\/item>/g
        let match
        
        while ((match = itemRegex.exec(xml)) !== null && items.length < 3) {
          const itemXml = match[1]
          const title = itemXml.match(/<title>([^<]+)<\/title>/)?.[1] || ''
          const description = itemXml.match(/<description>([^<]+)<\/description>/)?.[1] || ''
          const viewsMatch = description.match(/再生：([\d,]+)/)
          const views = viewsMatch ? parseInt(viewsMatch[1].replace(/,/g, '')) : 0
          
          console.log(`${items.length + 1}. ${title}`)
          console.log(`   再生数: ${views.toLocaleString()}`)
        }
      }
    } catch (error) {
      console.error('Error')
    }
  }
}

getReiSoreHourlyRankings().catch(console.error)