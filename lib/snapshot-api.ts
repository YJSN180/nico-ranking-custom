// Snapshot APIを使用してリアルタイムの動画統計情報を取得

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

export interface VideoStats {
  viewCounter?: number
  commentCounter?: number
  mylistCounter?: number
  likeCounter?: number
  tags?: string[]
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
  
  // 空の配列の場合は即座に返す
  if (videoIds.length === 0) {
    return stats
  }
  
  // バッチ処理（一度に最大100個 - Snapshot APIの推奨値）
  const batchSize = 100
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize)
    
    try {
      // jsonFilterを使用してバッチでクエリ
      const jsonFilter = JSON.stringify({
        type: 'or',
        filters: batch.map(id => ({
          type: 'equal',
          field: 'contentId',
          value: id
        }))
      })
      
      const params = new URLSearchParams({
        q: '',  // jsonFilter使用時はqは空
        targets: 'title',
        fields: 'contentId,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
        _sort: '-viewCounter',
        _limit: String(Math.min(batchSize, 100)),  // APIの最大値は100
        jsonFilter: jsonFilter
      })
      
      const response = await fetchWithGooglebot(`${SNAPSHOT_API_URL}?${params}`)
      
      if (response.ok) {
        const data = await response.json()
        
        if (data.data && Array.isArray(data.data)) {
          // 結果をマップに変換
          data.data.forEach((video: any) => {
            stats[video.contentId] = {
              viewCounter: video.viewCounter,
              commentCounter: video.commentCounter,
              mylistCounter: video.mylistCounter,
              likeCounter: video.likeCounter,
              tags: video.tags ? video.tags.split(' ').filter((tag: string) => tag.length > 0) : undefined
            }
          })
        }
      }
    } catch (error) {
      // エラーは静かに処理（部分的な失敗を許容）
      // Failed to fetch stats for batch - error handled silently
    }
    
    // レート制限対策（50ms待機）
    if (i + batchSize < videoIds.length) {
      await new Promise(resolve => setTimeout(resolve, 50))
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