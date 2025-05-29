import { EnhancedRankingItem } from '@/types/enhanced-ranking'

const SNAPSHOT_API_BASE = 'https://api.search.nicovideo.jp/api/v2/snapshot/video/contents/search'
const USER_AGENT = 'NicoRankingViewer/1.0'

interface SnapshotVideo {
  contentId: string
  title: string
  description: string
  viewCounter: number
  mylistCounter: number
  commentCounter: number
  likeCounter?: number
  startTime: string
  thumbnailUrl: string
  lengthSeconds: number
  userId: string
  channelId?: string
  tags: string
}

interface SnapshotResponse {
  data: SnapshotVideo[]
  meta: {
    totalCount: number
    status: number
  }
}

export async function fetchVideoDetails(videoIds: string[]): Promise<Map<string, Partial<EnhancedRankingItem>>> {
  if (videoIds.length === 0) return new Map()

  try {
    // Snapshot APIは contentId でAND検索ができるため、複数の動画を一度に取得
    const query = videoIds.join(' OR ')
    const fields = [
      'contentId',
      'title',
      'viewCounter',
      'mylistCounter',
      'commentCounter',
      'likeCounter',
      'startTime',
      'thumbnailUrl',
      'lengthSeconds',
      'userId',
      'channelId',
      'tags'
    ].join(',')

    const params = new URLSearchParams({
      q: query,
      targets: 'contentId',
      fields: fields,
      _sort: '-viewCounter',
      _limit: videoIds.length.toString(),
      _context: USER_AGENT
    })

    const response = await fetch(`${SNAPSHOT_API_BASE}?${params}`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    })

    if (!response.ok) {
      throw new Error(`Snapshot API error: ${response.status}`)
    }

    const data: SnapshotResponse = await response.json()
    
    const detailsMap = new Map<string, Partial<EnhancedRankingItem>>()
    
    data.data.forEach(video => {
      detailsMap.set(video.contentId, {
        comments: video.commentCounter,
        mylists: video.mylistCounter,
        likes: video.likeCounter || 0,
        uploadDate: video.startTime,
        duration: formatDuration(video.lengthSeconds),
        tags: video.tags ? video.tags.split(' ') : [],
        // Note: Snapshot API doesn't provide user info directly
        // We'll need to enhance this later or use placeholder
        uploader: {
          name: `user/${video.userId}`,
          icon: `/api/placeholder-icon?id=${video.userId}`,
          id: video.userId
        }
      })
    })
    
    return detailsMap
  } catch (error) {
    // Return empty map on error, let RSS data be displayed without enhancement
    return new Map()
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

// Merge RSS data with Snapshot API data
export function mergeRankingData(
  rssData: any[],
  detailsMap: Map<string, Partial<EnhancedRankingItem>>
): EnhancedRankingItem[] {
  return rssData.map((item, index) => {
    const details = detailsMap.get(item.id) || {}
    
    return {
      rank: index + 1,
      id: item.id,
      title: item.title,
      thumbURL: item.thumbURL,
      views: item.views,
      comments: details.comments || 0,
      mylists: details.mylists || 0,
      likes: details.likes || 0,
      uploadDate: details.uploadDate || new Date().toISOString(),
      duration: details.duration,
      tags: details.tags,
      uploader: details.uploader || {
        name: 'Unknown',
        icon: '/api/placeholder-icon?id=unknown'
      }
    }
  })
}