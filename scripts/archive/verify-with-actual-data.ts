// 実際に取得できるデータで検証

async function verifyWithActualData() {
  console.log('=== 実データでのアルゴリズム検証 ===\n')
  
  // 1. まず実際にRSSで取得できるか確認
  console.log('1. RSSランキング取得テスト')
  const tags = ['R-18', 'MMD', '紳士向け']
  
  for (const tag of tags) {
    const url = `https://www.nicovideo.jp/tag/${encodeURIComponent(tag)}?sort=h&rss=2.0`
    console.log(`\n${tag}タグ: ${url}`)
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      })
      
      console.log(`Status: ${response.status}`)
      
      if (response.ok) {
        const text = await response.text()
        const items = text.match(/<item>/g)
        console.log(`アイテム数: ${items?.length || 0}`)
        
        // 最初の動画のタイトルとIDを取得
        const firstTitle = text.match(/<item>[\s\S]*?<title>([^<]+)<\/title>/)?.[1]
        const firstLink = text.match(/<item>[\s\S]*?<link>([^<]+)<\/link>/)?.[1]
        const firstId = firstLink?.match(/(sm|nm|so)\d+/)?.[0]
        
        if (firstId) {
          console.log(`最初の動画: ${firstTitle}`)
          console.log(`ID: ${firstId}`)
          
          // この動画の詳細を取得
          await getVideoDetailsAndAnalyze(firstId)
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
  
  // 2. スナップショットAPIで人気動画を取得して分析
  console.log('\n\n2. スナップショットAPIでの分析')
  await analyzeWithSnapshotAPI()
}

// 個別動画の詳細を取得して分析
async function getVideoDetailsAndAnalyze(videoId: string) {
  const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?` +
    `q=${videoId}&` +
    `targets=contentId&` +
    `fields=contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,startTime&` +
    `_limit=1`
  
  try {
    const response = await fetch(url)
    const data = await response.json()
    
    if (data.data && data.data[0]) {
      const video = data.data[0]
      console.log(`  再生: ${video.viewCounter?.toLocaleString() || 0}`)
      console.log(`  コメント: ${video.commentCounter?.toLocaleString() || 0}`)
      console.log(`  マイリスト: ${video.mylistCounter?.toLocaleString() || 0}`)
      console.log(`  いいね: ${video.likeCounter?.toLocaleString() || 0}`)
      
      // 各種レートを計算
      const commentRate = video.commentCounter / video.viewCounter
      const mylistRate = video.mylistCounter / video.viewCounter
      const likeRate = video.likeCounter / video.viewCounter
      
      console.log(`  コメント率: ${(commentRate * 100).toFixed(2)}%`)
      console.log(`  マイリスト率: ${(mylistRate * 100).toFixed(2)}%`)
      console.log(`  いいね率: ${(likeRate * 100).toFixed(2)}%`)
    }
  } catch (error) {
    console.error('Details error:', error)
  }
}

// スナップショットAPIで直接分析
async function analyzeWithSnapshotAPI() {
  // R-18タグの上位動画を取得
  const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?` +
    `q=R-18&` +
    `targets=tagsExact&` +
    `fields=contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,startTime,genre&` +
    `_sort=-viewCounter&` +
    `_limit=10`
  
  try {
    const response = await fetch(url)
    const data = await response.json()
    
    if (data.data) {
      console.log('R-18タグ 再生数TOP10の分析:')
      
      const videos = data.data.filter((v: any) => v.genre === '例のソレ')
      
      // 各種アルゴリズムでスコアを計算
      videos.forEach((video: any, index: number) => {
        console.log(`\n${index + 1}. ${video.title}`)
        console.log(`   ジャンル: ${video.genre}`)
        console.log(`   再生: ${video.viewCounter?.toLocaleString()}`)
        
        // スコア計算
        const scores = {
          viewOnly: video.viewCounter,
          classic: video.viewCounter + (video.commentCounter * 10) + (video.mylistCounter * 20),
          modern: calculateModernScore(video),
          engagement: calculateEngagementScore(video)
        }
        
        console.log('   スコア:')
        Object.entries(scores).forEach(([name, score]) => {
          console.log(`     ${name}: ${score.toLocaleString()}`)
        })
      })
    }
  } catch (error) {
    console.error('Snapshot error:', error)
  }
}

function calculateModernScore(video: any) {
  const base = video.viewCounter + 
    (video.commentCounter * 10) + 
    (video.mylistCounter * 20) + 
    (video.likeCounter * 50)
  
  const likeRate = video.likeCounter / Math.max(video.viewCounter, 1)
  const boost = 1 + (likeRate * 20)
  
  return Math.floor(base * boost)
}

function calculateEngagementScore(video: any) {
  const totalEngagement = video.commentCounter + video.mylistCounter + video.likeCounter
  const engagementRate = totalEngagement / Math.max(video.viewCounter, 1)
  return Math.floor(video.viewCounter * (1 + engagementRate * 10))
}

// 実行
verifyWithActualData().catch(console.error)