// RSSランキングの順位と各指標の関係を深掘り分析

async function deepRankingAnalysis() {
  console.log('=== RSSランキングの深掘り分析 ===\n')
  
  // R-18タグの更新日時順（RSSのデフォルト）を取得
  const rssUrl = 'https://www.nicovideo.jp/tag/R-18?sort=h&rss=2.0'
  
  console.log('1. RSSランキング（更新日時順）の取得')
  
  try {
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/rss+xml'
      }
    })
    
    const rssText = await response.text()
    
    // RSS内の動画IDを抽出
    const videoIds: string[] = []
    const titleMap = new Map<string, string>()
    
    const itemMatches = rssText.matchAll(/<item>([\s\S]*?)<\/item>/g)
    for (const match of itemMatches) {
      const itemContent = match[1]
      const title = itemContent.match(/<title>([^<]+)<\/title>/)?.[1] || ''
      const link = itemContent.match(/<link>([^<]+)<\/link>/)?.[1] || ''
      const videoId = link.match(/(sm|nm|so)\d+/)?.[0]
      
      if (videoId) {
        videoIds.push(videoId)
        titleMap.set(videoId, title)
      }
      
      if (videoIds.length >= 10) break // TOP10のみ
    }
    
    console.log(`\nTOP10動画を取得: ${videoIds.length}件`)
    
    // 2. 各動画の詳細データを取得
    console.log('\n2. 各動画の詳細データを取得')
    
    const videoDataList: any[] = []
    
    for (let i = 0; i < videoIds.length; i += 5) {
      const batch = videoIds.slice(i, i + 5)
      const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?` +
        `q=${batch.join(' OR ')}&` +
        `targets=contentId&` +
        `fields=contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,startTime,lengthSeconds&` +
        `_limit=10`
      
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.data) {
        videoDataList.push(...data.data)
      }
    }
    
    // 3. RSSの順位と各指標の関係を分析
    console.log('\n3. ランキング順位と各指標の関係')
    console.log('順位 | 再生数 | コメ率 | マイ率 | いいね率 | 投稿経過(h) | タイトル')
    console.log('-'.repeat(80))
    
    videoIds.forEach((videoId, index) => {
      const video = videoDataList.find(v => v.contentId === videoId)
      if (!video) return
      
      const commentRate = (video.commentCounter / video.viewCounter * 100).toFixed(2)
      const mylistRate = (video.mylistCounter / video.viewCounter * 100).toFixed(2)
      const likeRate = (video.likeCounter / video.viewCounter * 100).toFixed(2)
      const hoursAgo = Math.floor((Date.now() - new Date(video.startTime).getTime()) / (1000 * 60 * 60))
      
      const title = titleMap.get(videoId)?.substring(0, 20) + '...'
      
      console.log(
        `${(index + 1).toString().padStart(2)} | ` +
        `${video.viewCounter.toString().padStart(7)} | ` +
        `${commentRate.padStart(6)}% | ` +
        `${mylistRate.padStart(5)}% | ` +
        `${likeRate.padStart(6)}% | ` +
        `${hoursAgo.toString().padStart(10)} | ` +
        `${title}`
      )
    })
    
    // 4. 相関分析
    console.log('\n4. 順位との相関分析')
    
    // 順位と各指標の相関を計算
    const ranks = videoIds.map((_, i) => i + 1)
    const views = videoIds.map(id => {
      const v = videoDataList.find(v => v.contentId === id)
      return v?.viewCounter || 0
    })
    const freshness = videoIds.map(id => {
      const v = videoDataList.find(v => v.contentId === id)
      if (!v) return 0
      return Date.now() - new Date(v.startTime).getTime()
    })
    
    // 簡易相関係数
    const viewCorr = calculateCorrelation(ranks, views)
    const freshCorr = calculateCorrelation(ranks, freshness)
    
    console.log(`再生数との相関: ${viewCorr.toFixed(3)}`)
    console.log(`新しさとの相関: ${freshCorr.toFixed(3)}`)
    
    // 5. 結論
    console.log('\n5. 分析結果')
    console.log('RSSの「更新日時順（sort=h）」は以下の特徴がある:')
    console.log('- 最近アクティブな動画（新規投稿または何らかの更新）が上位')
    console.log('- 必ずしも再生数順ではない')
    console.log('- エンゲージメント（コメント・マイリス・いいね）が活発な動画が優遇される可能性')
    
  } catch (error) {
    console.error('Error:', error)
  }
}

// 簡易相関係数計算
function calculateCorrelation(x: number[], y: number[]): number {
  const n = x.length
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0)
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0)
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0)
  
  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
  
  return denominator === 0 ? 0 : numerator / denominator
}

// 実行
deepRankingAnalysis().catch(console.error)