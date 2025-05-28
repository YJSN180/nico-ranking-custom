// ニコニコ動画のSnapshot API v2を使用して動画情報を取得

export interface VideoInfo {
  contentId: string
  title: string
  viewCounter: number
  commentCounter: number
  mylistCounter: number
  likeCounter: number
  thumbnail: {
    url: string
    largeUrl?: string
  }
  registeredAt: string
  lengthSeconds: number
}

// Snapshot API v2のレスポンス型
interface SnapshotResponse {
  data: Array<{
    contentId: string
    title: string
    viewCounter: number
    commentCounter: number
    mylistCounter: number
    likeCounter: number
    thumbnail: {
      url: string
      nHdUrl?: string
      largeUrl?: string
    }
    registeredAt: string
    lengthSeconds: number
  }>
}

// 複数の動画情報を一括取得
export async function fetchVideoInfoBatch(contentIds: string[]): Promise<Map<string, VideoInfo>> {
  const videoInfoMap = new Map<string, VideoInfo>()
  
  // 空の配列の場合は空のMapを返す
  if (contentIds.length === 0) {
    return videoInfoMap
  }

  // Snapshot API v2のエンドポイント
  const url = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/version'
  
  try {
    // まずAPIのバージョンを確認
    const versionResponse = await fetch(url)
    if (!versionResponse.ok) {
      throw new Error(`API version check failed: ${versionResponse.status}`)
    }

    // 動画情報を取得（最大100件まで）
    const batchSize = 100
    for (let i = 0; i < contentIds.length; i += batchSize) {
      const batch = contentIds.slice(i, i + batchSize)
      const query = {
        q: batch.map(id => `contentId:${id}`).join(' OR '),
        targets: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnail,registeredAt,lengthSeconds',
        fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnail,registeredAt,lengthSeconds',
        _limit: batch.length.toString()
      }

      const searchUrl = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?${new URLSearchParams(query)}`
      const response = await fetch(searchUrl)
      
      if (!response.ok) {
        console.error(`Failed to fetch video info: ${response.status}`)
        continue
      }

      const data: SnapshotResponse = await response.json()
      
      // 結果をMapに格納
      data.data.forEach(video => {
        videoInfoMap.set(video.contentId, {
          contentId: video.contentId,
          title: video.title,
          viewCounter: video.viewCounter,
          commentCounter: video.commentCounter,
          mylistCounter: video.mylistCounter,
          likeCounter: video.likeCounter || 0, // いいね数は比較的新しい機能なので0の場合がある
          thumbnail: {
            url: video.thumbnail.url,
            largeUrl: video.thumbnail.largeUrl
          },
          registeredAt: video.registeredAt,
          lengthSeconds: video.lengthSeconds
        })
      })
    }
  } catch (error) {
    console.error('Error fetching video info:', error)
    // エラーが発生しても空のMapを返す（フォールバック）
  }

  return videoInfoMap
}