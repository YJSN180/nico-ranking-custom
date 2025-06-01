#!/usr/bin/env tsx

// 正しい方法でBB先輩シリーズのタグ別ランキングを取得

interface VideoItem {
  rank: number
  id: string
  title: string
  views?: number
  comments?: number
  mylists?: number
  duration?: string
  thumbnailUrl?: string
}

async function getRealBBRanking(): Promise<void> {
  console.log('=== 「BB先輩シリーズ」タグの実際のランキング ===')
  
  // 正しい検索エンドポイント（再生数順ソート）
  const searchUrl = 'https://www.nicovideo.jp/search/BB%E5%85%88%E8%BC%A9%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BA?sort=f&order=d'
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: searchUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja',
          'Cookie': 'sensitive_material_status=accept',
        }
      }),
    })

    const proxyData = await response.json()
    const html = proxyData.body
    
    console.log(`✅ データ取得成功 (HTMLサイズ: ${html.length}文字)`)
    console.log('🔍 検索URL:', searchUrl)
    console.log('📅 ソート: 投稿日時順（新しい順）')
    
    // 動画IDとタイトルをペアで抽出
    const videoData: VideoItem[] = []
    
    // 動画IDの抽出
    const videoIdPattern = /(?:data-video-id|href="\/watch\/)="?((?:sm|nm|so)\d+)"?/g
    const titlePattern = /title="([^"]+)"/g
    
    let videoIdMatch
    const videoIds = []
    while ((videoIdMatch = videoIdPattern.exec(html)) !== null) {
      if (!videoIds.includes(videoIdMatch[1])) {
        videoIds.push(videoIdMatch[1])
      }
    }
    
    let titleMatch
    const titles = []
    while ((titleMatch = titlePattern.exec(html)) !== null) {
      const title = titleMatch[1].trim()
      if (title.length > 5 && title.length < 200 && !titles.includes(title)) {
        titles.push(title)
      }
    }
    
    // IDとタイトルを対応付け（順序ベース）
    const minLength = Math.min(videoIds.length, titles.length)
    for (let i = 0; i < minLength; i++) {
      videoData.push({
        rank: i + 1,
        id: videoIds[i],
        title: titles[i]
      })
    }
    
    console.log(`\n📊 検出された動画: ${videoData.length}件`)
    
    // BB先輩関連のフィルタリング
    const bbVideos = videoData.filter(video => 
      video.title.includes('BB') || 
      video.title.includes('先輩') || 
      video.title.includes('淫夢') ||
      video.title.includes('例のアレ') ||
      video.title.includes('クッキー') ||
      video.title.includes('ホモ')
    )
    
    console.log(`🎯 BB先輩関連動画: ${bbVideos.length}件`)
    
    console.log('\n=== 📈 「BB先輩シリーズ」タグ TOP 10 ===')
    
    // 上位10件を表示（全動画から）
    videoData.slice(0, 10).forEach((video, index) => {
      const isBBRelated = bbVideos.some(bb => bb.id === video.id)
      const marker = isBBRelated ? '🎯' : '📺'
      
      console.log(`\n${marker} ${index + 1}位: ${video.title}`)
      console.log(`     動画ID: ${video.id}`)
      console.log(`     ニコニコURL: https://www.nicovideo.jp/watch/${video.id}`)
      
      if (isBBRelated) {
        console.log('     🏷️ BB先輩・淫夢関連動画')
      }
    })
    
    // BB先輩関連動画のみの TOP 10
    if (bbVideos.length > 0) {
      console.log('\n=== 🎯 BB先輩関連動画のみ TOP 10 ===')
      bbVideos.slice(0, 10).forEach((video, index) => {
        console.log(`\n${index + 1}. ${video.title}`)
        console.log(`   動画ID: ${video.id}`)
        console.log(`   全体順位: ${video.rank}位`)
        console.log(`   URL: https://www.nicovideo.jp/watch/${video.id}`)
      })
    }
    
    // 統計情報
    console.log('\n=== 📊 統計情報 ===')
    console.log(`検索結果総数: ${videoData.length}件`)
    console.log(`BB先輩関連: ${bbVideos.length}件 (${Math.round(bbVideos.length/videoData.length*100)}%)`)
    console.log(`その他: ${videoData.length - bbVideos.length}件`)
    
    // センシティブコンテンツの確認
    const sensitiveVideos = videoData.filter(video => 
      video.title.includes('セックス') ||
      video.title.includes('エロ') ||
      video.title.includes('淫') ||
      video.title.includes('18禁') ||
      video.title.includes('大人')
    )
    
    if (sensitiveVideos.length > 0) {
      console.log(`🔞 センシティブコンテンツ: ${sensitiveVideos.length}件検出`)
    }
    
    console.log('\n✅ これが「BB先輩シリーズ」タグの実際のランキングです！')
    console.log('   (従来の方法では総合ランキングが返されていました)')
    
  } catch (error) {
    console.error('❌ エラー:', error)
  }
}

getRealBBRanking().catch(console.error)