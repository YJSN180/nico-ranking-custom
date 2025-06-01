// 実際のRSSランキングとアルゴリズムを検証

import { XMLParser } from 'fast-xml-parser'

interface VideoData {
  id: string
  title: string
  viewCount: number
  commentCount: number
  mylistCount: number
  likeCount: number
  uploadTime: Date
  description: string
}

interface RankingItem {
  rank: number
  id: string
  title: string
}

// スナップショットAPIから詳細データを取得
async function getVideoDetails(videoIds: string[]): Promise<Map<string, VideoData>> {
  const videoMap = new Map<string, VideoData>()
  
  // スナップショットAPIで詳細情報を取得
  const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?` +
    `q=${videoIds.join(' OR ')}&` +
    `targets=contentId&` +
    `fields=contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,startTime,description&` +
    `_limit=100`
  
  try {
    const response = await fetch(url)
    const data = await response.json()
    
    if (data.data) {
      data.data.forEach((video: any) => {
        videoMap.set(video.contentId, {
          id: video.contentId,
          title: video.title,
          viewCount: video.viewCounter || 0,
          commentCount: video.commentCounter || 0,
          mylistCount: video.mylistCounter || 0,
          likeCount: video.likeCounter || 0,
          uploadTime: new Date(video.startTime),
          description: video.description || ''
        })
      })
    }
  } catch (error) {
    console.error('Error fetching video details:', error)
  }
  
  return videoMap
}

// RSSからランキングを取得
async function getRSSRanking(tag: string): Promise<RankingItem[]> {
  const rssUrl = `https://www.nicovideo.jp/tag/${encodeURIComponent(tag)}?sort=h&rss=2.0`
  
  try {
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/rss+xml'
      }
    })
    
    const rssText = await response.text()
    const parser = new XMLParser()
    const rssData = parser.parse(rssText)
    
    const items: RankingItem[] = []
    const rssItems = rssData.rss?.channel?.item || []
    
    rssItems.forEach((item: any, index: number) => {
      const link = item.link || ''
      const videoId = link.match(/(sm|nm|so)\d+/)?.[0] || ''
      
      if (videoId) {
        items.push({
          rank: index + 1,
          id: videoId,
          title: item.title || ''
        })
      }
    })
    
    return items
  } catch (error) {
    console.error('Error fetching RSS:', error)
    return []
  }
}

// 各アルゴリズムのスコア計算
const algorithms = {
  // 1. シンプルな再生数
  viewOnly: (v: VideoData) => v.viewCount,
  
  // 2. 従来のニコニコ風
  classic: (v: VideoData) => {
    return v.viewCount + (v.commentCount * 10) + (v.mylistCount * 20)
  },
  
  // 3. 現代のニコニコ風（いいね重視）
  modern: (v: VideoData) => {
    const base = v.viewCount + (v.commentCount * 10) + (v.mylistCount * 20) + (v.likeCount * 50)
    const likeRate = v.likeCount / Math.max(v.viewCount, 1)
    const boost = 1 + (likeRate * 20)
    return base * boost
  },
  
  // 4. エンゲージメント率重視
  engagement: (v: VideoData) => {
    const totalEngagement = v.commentCount + v.mylistCount + v.likeCount
    const engagementRate = totalEngagement / Math.max(v.viewCount, 1)
    return v.viewCount * (1 + engagementRate * 10)
  },
  
  // 5. 時間減衰あり
  timeDecay: (v: VideoData) => {
    const base = v.viewCount + (v.commentCount * 10) + (v.mylistCount * 20) + (v.likeCount * 50)
    const hoursOld = (Date.now() - v.uploadTime.getTime()) / (1000 * 60 * 60)
    const decay = Math.pow(0.95, hoursOld / 24)
    return base * decay
  }
}

// ランキングの一致度を計算
function calculateAccuracy(actual: RankingItem[], predicted: RankingItem[]): number {
  let matches = 0
  const topN = Math.min(10, actual.length, predicted.length)
  
  for (let i = 0; i < topN; i++) {
    // 同じ位置に同じ動画があるか
    if (actual[i]?.id === predicted[i]?.id) {
      matches++
    }
    // ±2位以内にあるか
    for (let j = Math.max(0, i - 2); j <= Math.min(topN - 1, i + 2); j++) {
      if (actual[i]?.id === predicted[j]?.id) {
        matches += 0.5
        break
      }
    }
  }
  
  return (matches / topN) * 100
}

// メイン検証関数
async function verifyAlgorithms() {
  console.log('=== ランキングアルゴリズム検証 ===\n')
  
  const tags = ['R-18', 'MMD', '紳士向け']
  
  for (const tag of tags) {
    console.log(`\n【${tag}タグのランキング】`)
    
    // 1. 実際のRSSランキングを取得
    const actualRanking = await getRSSRanking(tag)
    console.log(`実際のランキング: ${actualRanking.length}件取得`)
    
    if (actualRanking.length === 0) continue
    
    // 2. 動画の詳細情報を取得
    const videoIds = actualRanking.map(item => item.id)
    const videoDetails = await getVideoDetails(videoIds)
    
    // 3. 各アルゴリズムでスコアを計算
    const results: Record<string, number> = {}
    
    for (const [algoName, algoFunc] of Object.entries(algorithms)) {
      // スコア計算
      const scored = Array.from(videoDetails.values())
        .map(video => ({
          ...video,
          score: algoFunc(video)
        }))
        .sort((a, b) => b.score - a.score)
      
      // ランキング形式に変換
      const predictedRanking: RankingItem[] = scored.map((v, i) => ({
        rank: i + 1,
        id: v.id,
        title: v.title
      }))
      
      // 一致度を計算
      const accuracy = calculateAccuracy(actualRanking, predictedRanking)
      results[algoName] = accuracy
    }
    
    // 結果表示
    console.log('\nアルゴリズム別の一致度:')
    Object.entries(results)
      .sort(([,a], [,b]) => b - a)
      .forEach(([name, accuracy]) => {
        console.log(`  ${name}: ${accuracy.toFixed(1)}%`)
      })
    
    // TOP5の比較
    console.log('\n実際のTOP5:')
    actualRanking.slice(0, 5).forEach(item => {
      const details = videoDetails.get(item.id)
      if (details) {
        console.log(`  ${item.rank}. ${item.title}`)
        console.log(`     再生:${details.viewCount} コメ:${details.commentCount} マイ:${details.mylistCount} いいね:${details.likeCount}`)
      }
    })
  }
  
  // 追加分析
  console.log('\n\n=== 追加分析 ===')
  console.log('ニコニコチャートとの比較も行う...')
  
  // ニコニコチャートのデータを取得して比較
  const nicochartUrl = 'https://www.nicochart.jp/ranking/genre/d2um7mc4'
  console.log(`ニコニコチャート: ${nicochartUrl}`)
  console.log('（ブラウザで確認して比較してください）')
}

// 実行
verifyAlgorithms().catch(console.error)