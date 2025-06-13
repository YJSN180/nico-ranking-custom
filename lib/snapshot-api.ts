// Snapshot APIを使用してリアルタイムの動画統計情報を取得

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

export interface VideoStats {
  viewCounter?: number
  commentCounter?: number
  mylistCounter?: number
  likeCounter?: number
}

// Googlebot UAでSnapshot APIにアクセス
async function fetchWithGooglebot(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'application/json',
      'Accept-Language': 'ja'
    }
  })
}

// 複数の動画IDの統計情報を取得
export async function fetchVideoStats(videoIds: string[]): Promise<Record<string, VideoStats>> {
  const stats: Record<string, VideoStats> = {}
  
  // バッチ処理（一度に最大10個）
  const batchSize = 10
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize)
    
    try {
      // contentIdで検索
      const query = batch.map(id => `contentId:${id}`).join(' OR ')
      const params = new URLSearchParams({
        q: query,
        targets: 'title', // titleフィールドで検索
        fields: 'contentId,viewCounter,commentCounter,mylistCounter,likeCounter',
        _limit: String(batch.length)
      })
      
      const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
      
      if (response.ok) {
        const data = await response.json()
        
        // 結果をマップに変換
        if (data.data && Array.isArray(data.data)) {
          data.data.forEach((item: any) => {
            if (item.contentId) {
              stats[item.contentId] = {
                viewCounter: item.viewCounter,
                commentCounter: item.commentCounter,
                mylistCounter: item.mylistCounter,
                likeCounter: item.likeCounter
              }
            }
          })
        }
      }
    } catch (error) {
      // エラーは静かに処理（部分的な失敗を許容）
      // Failed to fetch stats for batch - error handled silently
    }
    
    // レート制限対策
    if (i + batchSize < videoIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return stats
}

// タグで動画を検索して統計情報を取得
export async function searchVideosByTag(tag: string, limit: number = 100): Promise<Array<{
  contentId: string
  title: string
  viewCounter: number
  commentCounter: number
  mylistCounter: number
  likeCounter: number
}>> {
  try {
    const params = new URLSearchParams({
      q: tag,
      targets: 'tagsExact',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter',
      _sort: '-viewCounter',
      _limit: String(limit)
    })
    
    const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
    
    if (response.ok) {
      const data = await response.json()
      return data.data || []
    }
  } catch (error) {
    // Failed to search videos by tag - returning empty array
  }
  
  return []
}