// 例のソレジャンルの人気タグ別ランキングを取得（修正版）

async function getReiSoreRankingsFixed() {
  console.log('=== 例のソレジャンル 人気タグ別ランキング ===\n')
  console.log(new Date().toLocaleString('ja-JP'))
  console.log('\n')
  
  // 例のソレジャンルの人気タグ
  const popularTags = ['R-18', '紳士向け', 'MMD', 'ボイロAV']
  
  // 通常のブラウザのUser-Agentを使用
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache'
  }
  
  // タグ検索のRSSで最新動画を取得
  console.log('=== タグ検索RSS（更新日時順） ===')
  
  for (const tag of popularTags) {
    console.log(`\n--- ${tag}タグ 最新動画TOP5 ---`)
    
    const tagUrl = `https://www.nicovideo.jp/tag/${encodeURIComponent(tag)}?sort=h&rss=2.0`
    console.log(`URL: ${tagUrl}`)
    
    try {
      const response = await fetch(tagUrl, { headers })
      
      console.log(`Status: ${response.status}`)
      
      if (response.status === 200) {
        const xml = await response.text()
        
        // XMLの妥当性チェック
        if (!xml.startsWith('<?xml')) {
          console.log('警告: XMLではない応答が返されました')
          continue
        }
        
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
          
          // HTMLエンティティをデコード
          const decodedTitle = title
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
          
          // 動画IDを抽出
          const videoId = link.match(/(sm|nm|so)\d+/)?.[0] || ''
          
          // descriptionから統計情報を抽出
          const decodedDesc = description
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
          
          const viewsMatch = decodedDesc.match(/再生：<strong[^>]*>([\d,]+)<\/strong>/)
          const commentsMatch = decodedDesc.match(/コメント：<strong[^>]*>([\d,]+)<\/strong>/)
          const mylistsMatch = decodedDesc.match(/マイリスト：<strong[^>]*>([\d,]+)<\/strong>/)
          
          const views = viewsMatch ? parseInt(viewsMatch[1].replace(/,/g, '')) : 0
          const comments = commentsMatch ? parseInt(commentsMatch[1].replace(/,/g, '')) : 0
          const mylists = mylistsMatch ? parseInt(mylistsMatch[1].replace(/,/g, '')) : 0
          
          // 投稿からの経過時間を計算
          const pubTime = new Date(pubDate)
          const now = new Date()
          const minutesAgo = Math.floor((now.getTime() - pubTime.getTime()) / (1000 * 60))
          const hoursAgo = Math.floor(minutesAgo / 60)
          const timeAgoStr = hoursAgo > 0 ? `${hoursAgo}時間前` : `${minutesAgo}分前`
          
          items.push({
            rank: items.length + 1,
            title: decodedTitle,
            videoId,
            views,
            comments,
            mylists,
            timeAgo: timeAgoStr,
            pubDate: pubTime.toLocaleString('ja-JP')
          })
        }
        
        // 結果を表示
        if (items.length > 0) {
          items.forEach(item => {
            console.log(`${item.rank}. ${item.title}`)
            console.log(`   ID: ${item.videoId}`)
            console.log(`   再生: ${item.views.toLocaleString()} / コメント: ${item.comments.toLocaleString()} / マイリスト: ${item.mylists.toLocaleString()}`)
            console.log(`   投稿: ${item.pubDate} (${item.timeAgo})`)
          })
        } else {
          console.log('   動画が見つかりませんでした')
        }
      } else if (response.status === 403) {
        console.log('   403 Forbidden - アクセス制限されています')
      } else if (response.status === 406) {
        console.log('   406 Not Acceptable - User-Agentが拒否されました')
      }
    } catch (error) {
      console.error(`   エラー:`, error)
    }
  }
  
  // Cookie付きでも試してみる
  console.log('\n\n=== Cookie認証付きで再試行 ===')
  
  const authHeaders = {
    ...headers,
    'Cookie': 'sensitive_material_status=accept'
  }
  
  const testTag = 'R-18'
  const testUrl = `https://www.nicovideo.jp/tag/${encodeURIComponent(testTag)}?sort=h&rss=2.0`
  
  try {
    const response = await fetch(testUrl, { headers: authHeaders })
    console.log(`${testTag}タグ (Cookie付き): Status ${response.status}`)
    
    if (response.status === 200) {
      const xml = await response.text()
      const firstTitle = xml.match(/<item>[\s\S]*?<title>([^<]+)<\/title>/)?.[1]
      if (firstTitle) {
        console.log(`最初の動画: ${firstTitle}`)
      }
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

getReiSoreRankingsFixed().catch(console.error)