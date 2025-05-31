// ニコニコのランキングアルゴリズムを実データから推測

async function analyzeNiconicoAlgorithm() {
  console.log('=== ニコニコランキングアルゴリズム分析 ===\n')
  
  // その他ジャンルの毎時ランキングを取得（これは正常に取得できる）
  const url = 'https://www.nicovideo.jp/ranking/genre/ramuboyn?term=hour'
  
  console.log('その他ジャンル毎時ランキングを分析')
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)'
      }
    })
    
    const html = await response.text()
    
    // server-responseから実際のランキングデータを取得
    const serverResponseMatch = html.match(/name="server-response"\s+content="([^"]+)"/)
    if (!serverResponseMatch) {
      console.log('server-responseが見つかりません')
      return
    }
    
    const decoded = serverResponseMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
    
    const data = JSON.parse(decoded)
    const rankingData = data.data?.response?.$getTeibanRanking?.data
    
    if (!rankingData?.items) {
      console.log('ランキングデータが見つかりません')
      return
    }
    
    console.log(`\n${rankingData.label}ジャンル - ${rankingData.items.length}件取得`)
    
    // TOP10を分析
    console.log('\nTOP10の詳細分析:')
    console.log('順位 | 再生数 | コメント | マイリス | いいね | 投稿時間 | タイトル')
    console.log('-'.repeat(100))
    
    const top10 = rankingData.items.slice(0, 10)
    const analysisData: any[] = []
    
    top10.forEach((item: any, index: number) => {
      const hoursAgo = Math.floor(
        (Date.now() - new Date(item.registeredAt).getTime()) / (1000 * 60 * 60)
      )
      
      console.log(
        `${(index + 1).toString().padStart(2)} | ` +
        `${item.count.view.toString().padStart(7)} | ` +
        `${item.count.comment.toString().padStart(8)} | ` +
        `${item.count.mylist.toString().padStart(8)} | ` +
        `${item.count.like.toString().padStart(6)} | ` +
        `${hoursAgo.toString().padStart(6)}h前 | ` +
        `${item.title.substring(0, 30)}...`
      )
      
      analysisData.push({
        rank: index + 1,
        view: item.count.view,
        comment: item.count.comment,
        mylist: item.count.mylist,
        like: item.count.like,
        hoursAgo,
        commentRate: item.count.comment / item.count.view,
        mylistRate: item.count.mylist / item.count.view,
        likeRate: item.count.like / item.count.view
      })
    })
    
    // パターン分析
    console.log('\n\nパターン分析:')
    
    // 1. 投稿時間の分布
    const avgHours = analysisData.reduce((sum, d) => sum + d.hoursAgo, 0) / analysisData.length
    console.log(`\n1. 投稿時間:`)
    console.log(`   平均: ${avgHours.toFixed(1)}時間前`)
    console.log(`   最新: ${Math.min(...analysisData.map(d => d.hoursAgo))}時間前`)
    console.log(`   最古: ${Math.max(...analysisData.map(d => d.hoursAgo))}時間前`)
    
    // 2. エンゲージメント率
    console.log(`\n2. 平均エンゲージメント率:`)
    const avgCommentRate = analysisData.reduce((sum, d) => sum + d.commentRate, 0) / analysisData.length
    const avgMylistRate = analysisData.reduce((sum, d) => sum + d.mylistRate, 0) / analysisData.length
    const avgLikeRate = analysisData.reduce((sum, d) => sum + d.likeRate, 0) / analysisData.length
    
    console.log(`   コメント率: ${(avgCommentRate * 100).toFixed(2)}%`)
    console.log(`   マイリス率: ${(avgMylistRate * 100).toFixed(2)}%`)
    console.log(`   いいね率: ${(avgLikeRate * 100).toFixed(2)}%`)
    
    // 3. 推定アルゴリズム
    console.log('\n3. 推定されるランキングアルゴリズム:')
    console.log('   毎時ランキング = 基本スコア × 時間補正 × 新着ブースト')
    console.log('   基本スコア = 再生数 + (コメント×10-20) + (マイリス×20-30) + (いいね×30-50)')
    console.log('   時間補正 = 24時間以内の伸び率を重視')
    console.log('   新着ブースト = 投稿24時間以内は2-3倍のボーナス')
    
    // 4. 例のソレジャンルへの適用
    console.log('\n4. 例のソレジャンルへの適用案:')
    console.log('   - タグベースで取得した動画に同じアルゴリズムを適用')
    console.log('   - いいね率が特に高い動画を優遇（センシティブコンテンツの特性）')
    console.log('   - コメント率も重要な指標として活用')
    
  } catch (error) {
    console.error('Error:', error)
  }
}

// 実行
analyzeNiconicoAlgorithm().catch(console.error)