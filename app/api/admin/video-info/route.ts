import { NextRequest, NextResponse } from 'next/server'
import { DERIVED_NG_VIDEO_INFO_MAP_KEY } from '@/lib/admin-ng-constants'

export const runtime = 'nodejs'

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

interface VideoInfoResponseItem {
  title: string
  authorName: string | null
  isDeleted?: boolean
}

interface CachedVideoInfoEntry {
  title?: string
  authorName?: string | null
  isDeleted?: boolean
  updatedAt?: string
}

const normalizeCachedEntry = (entry?: CachedVideoInfoEntry | null): VideoInfoResponseItem => {
  const isDeleted = entry?.isDeleted ?? false
  return {
    title: entry?.title || (isDeleted ? '削除された動画' : '情報未取得'),
    authorName: entry?.authorName ?? null,
    isDeleted
  }
}

const fetchCachedVideoInfo = async (
  videoIds: string[],
  accountId: string,
  namespaceId: string,
  apiToken: string
) => {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${DERIVED_NG_VIDEO_INFO_MAP_KEY}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`
      }
    }
  )

  let cacheMap: Record<string, CachedVideoInfoEntry> = {}

  if (response.ok) {
    cacheMap = (await response.json()) as Record<string, CachedVideoInfoEntry>
  } else if (response.status !== 404) {
    throw new Error(`KV cache fetch failed: ${response.status}`)
  }

  const videoMap: Record<string, VideoInfoResponseItem> = {}
  for (const id of videoIds) {
    videoMap[id] = normalizeCachedEntry(cacheMap[id])
  }

  return videoMap
}

const fetchSnapshotVideoInfo = async (videoIds: string[]) => {
  const jsonFilter = JSON.stringify({
    type: 'or',
    filters: videoIds.map(id => ({
      type: 'equal',
      field: 'contentId',
      value: id
    }))
  })

  const params = new URLSearchParams({
    q: '',
    targets: 'title',
    fields: 'contentId,title,userId,channelId,viewCounter,commentCounter,mylistCounter,likeCounter',
    _sort: '-viewCounter',
    _limit: String(Math.min(videoIds.length, 50)),
    jsonFilter
  })

  const response = await fetch(`${SNAPSHOT_API_URL}?${params}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      Accept: 'application/json',
      'Accept-Language': 'ja'
    }
  })

  if (!response.ok) {
    throw new Error(`Snapshot API error: ${response.status}`)
  }

  const data = await response.json()
  const foundVideos: Record<string, VideoInfoResponseItem> = {}

  if (data.data && Array.isArray(data.data)) {
    for (const video of data.data) {
      foundVideos[video.contentId] = {
        title: video.title || 'タイトル不明',
        authorName: `投稿者ID: ${video.channelId || video.userId || '不明'}`,
        isDeleted: false
      }
    }
  }

  const videoMap: Record<string, VideoInfoResponseItem> = {}
  for (const id of videoIds) {
    if (foundVideos[id]) {
      videoMap[id] = foundVideos[id]
    } else {
      videoMap[id] = {
        title: '削除された動画',
        authorName: null,
        isDeleted: true
      }
    }
  }

  return videoMap
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')

  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { videoIds } = body

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return NextResponse.json({ error: 'Video IDs required' }, { status: 400 })
    }

    if (videoIds.length > 50) {
      return NextResponse.json({ error: 'Too many video IDs (max 50)' }, { status: 400 })
    }

    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN

    const videoMap = CF_ACCOUNT_ID && CF_NAMESPACE_ID && CF_API_TOKEN
      ? await fetchCachedVideoInfo(videoIds, CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN)
      : await fetchSnapshotVideoInfo(videoIds)

    return NextResponse.json({ videos: videoMap })
  } catch (error) {
    console.error('Error fetching video info:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
