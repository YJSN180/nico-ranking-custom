// タグRSSを詳しく分析

async function analyzeTagRSS() {
  console.log('=== タグRSSから例のソレジャンルの動画を取得 ===\n')
  
  // 例のソレジャンルの人気タグ
  const reiSoreTags = ['R-18', 'MMD', '紳士向け', 'ボイロAV']
  
  for (const tag of reiSoreTags) {
    console.log(`\n=== ${tag}タグ ===`)
    const url = `https://www.nicovideo.jp/tag/${encodeURIComponent(tag)}?sort=h&rss=2.0`
    console.log(`URL: ${url}`)
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Googlebot/2.1',
          'Accept': 'application/rss+xml'
        }
      })
      
      if (response.status === 200) {
        const xml = await response.text()
        
        // アイテムを抽出
        const itemRegex = /<item>([\s\S]*?)<\/item>/g
        const items = []
        let match
        
        while ((match = itemRegex.exec(xml)) !== null) {
          const itemXml = match[1]
          
          // 各要素を抽出
          const title = itemXml.match(/<title>([^<]+)<\/title>/)?.[1] || ''
          const link = itemXml.match(/<link>([^<]+)<\/link>/)?.[1] || ''
          const description = itemXml.match(/<description>([^<]+)<\/description>/)?.[1] || ''
          const pubDate = itemXml.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] || ''
          
          // 動画IDを抽出
          const videoId = link.match(/(sm|nm|so)\d+/)?.[0] || ''
          
          // descriptionからスタッツを抽出
          const stats = {
            views: description.match(/再生：([\d,]+)/)?.[1]?.replace(/,/g, '') || '0',
            comments: description.match(/コメント：([\d,]+)/)?.[1]?.replace(/,/g, '') || '0',
            mylists: description.match(/マイリスト：([\d,]+)/)?.[1]?.replace(/,/g, '') || '0'
          }
          
          items.push({
            title,
            videoId,
            link,
            pubDate,
            stats
          })
        }
        
        console.log(`取得数: ${items.length}`)
        
        // 最初の5件を表示
        console.log('\n上位5件:')
        items.slice(0, 5).forEach((item, i) => {
          console.log(`${i + 1}. ${item.title}`)
          console.log(`   ID: ${item.videoId}`)
          console.log(`   再生数: ${parseInt(item.stats.views).toLocaleString()}`)
          console.log(`   投稿日: ${new Date(item.pubDate).toLocaleString('ja-JP')}`)
          
          // 例のソレ特有のキーワードをチェック
          if (item.title.includes('紳士') || item.title.includes('R-18')) {
            console.log('   ⭐ 例のソレコンテンツ')
          }
        })
        
        // メスガキサンゴの動画を探す
        const mesuGakiVideo = items.find(item => 
          item.title.includes('メスガキ') && item.title.includes('サンゴ')
        )
        if (mesuGakiVideo) {
          console.log(`\n🎯 メスガキサンゴの動画を発見:`)
          console.log(`   ${mesuGakiVideo.title}`)
          console.log(`   ${mesuGakiVideo.link}`)
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // 時間順と再生数順の違いを確認
  console.log('\n\n=== ソート順の違い ===')
  
  const sortTypes = [
    { name: '再生数順', param: 'v' },
    { name: '投稿日時順', param: 'f' },
    { name: 'コメント数順', param: 'r' },
    { name: 'マイリスト数順', param: 'm' },
    { name: '更新日時順', param: 'h' }
  ]
  
  for (const sort of sortTypes) {
    const url = `https://www.nicovideo.jp/tag/MMD?sort=${sort.param}&rss=2.0`
    console.log(`\n${sort.name}: ${url}`)
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Googlebot/2.1'
        }
      })
      
      if (response.status === 200) {
        const xml = await response.text()
        const firstTitle = xml.match(/<item>[\s\S]*?<title>([^<]+)<\/title>/)?.[1]
        console.log(`最初の動画: ${firstTitle}`)
      }
    } catch (error) {
      console.error('Error')
    }
  }
}

analyzeTagRSS().catch(console.error)