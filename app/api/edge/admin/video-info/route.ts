import { NextRequest, NextResponse } from 'next/server'

// Edge Runtime指定
export const runtime = 'edge'

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

interface VideoInfo {
  id: string
  title: string
  authorName: string
  url: string
  viewCount: number
  commentCount: number
  mylistCount: number
  likeCount: number
}

export async function GET(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get video IDs from query parameter
  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('ids')
  
  if (!idsParam) {
    return NextResponse.json({ error: 'Video IDs required' }, { status: 400 })
  }

  const videoIds = idsParam.split(',').filter(Boolean)
  
  if (videoIds.length === 0) {
    return NextResponse.json({ error: 'Video IDs required' }, { status: 400 })
  }
  
  if (videoIds.length > 50) {
    return NextResponse.json({ error: 'Too many video IDs (max 50)' }, { status: 400 })
  }

  try {
    // Create jsonFilter for batch query
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
      jsonFilter: jsonFilter
    })
    
    // Fetch from Snapshot API with Googlebot UA
    const response = await fetch(`${SNAPSHOT_API_URL}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/json',
        'Accept-Language': 'ja'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Snapshot API error: ${response.status}`)
    }

    const data = await response.json()
    const foundVideos: VideoInfo[] = []
    const foundIds = new Set<string>()
    
    if (data.data && Array.isArray(data.data)) {
      data.data.forEach((video: any) => {
        foundIds.add(video.contentId)
        foundVideos.push({
          id: video.contentId,
          title: video.title || '（タイトル不明）',
          authorName: video.channelId 
            ? `channel/${video.channelId}` 
            : video.userId 
              ? `user/${video.userId}`
              : '（投稿者不明）',
          url: `https://www.nicovideo.jp/watch/${video.contentId}`,
          viewCount: video.viewCounter || 0,
          commentCount: video.commentCounter || 0,
          mylistCount: video.mylistCounter || 0,
          likeCount: video.likeCounter || 0
        })
      })
    }
    
    // Find videos that were not found
    const notFound = videoIds.filter(id => !foundIds.has(id))
    
    const responseData = {
      videos: foundVideos,
      notFound: notFound
    }
    
    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'private, s-maxage=300, stale-while-revalidate=60'
      }
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch video information' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { videoIds } = await request.json()
  
  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return NextResponse.json({ error: 'Invalid video IDs' }, { status: 400 })
  }
  
  if (videoIds.length > 50) {
    return NextResponse.json({ error: 'Too many video IDs (max 50)' }, { status: 400 })
  }

  try {
    // Create jsonFilter for batch query
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
      fields: 'contentId,title,userId,channelId,tags,genre',
      _sort: '-viewCounter',
      _limit: String(Math.min(videoIds.length, 50)),
      jsonFilter: jsonFilter
    })
    
    // Fetch from Snapshot API with Googlebot UA
    const response = await fetch(`${SNAPSHOT_API_URL}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/json',
        'Accept-Language': 'ja'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Snapshot API error: ${response.status}`)
    }

    const data = await response.json()
    const videos: Record<string, any> = {}
    
    if (data.data && Array.isArray(data.data)) {
      data.data.forEach((video: any) => {
        videos[video.contentId] = {
          title: video.title || '（タイトル不明）',
          authorName: video.channelId 
            ? `channel/${video.channelId}` 
            : video.userId 
              ? `user/${video.userId}`
              : '（投稿者不明）',
          isDeleted: false
        }
      })
    }
    
    // Mark not found videos as deleted
    videoIds.forEach(id => {
      if (!videos[id]) {
        videos[id] = {
          title: '削除された動画',
          authorName: null,
          isDeleted: true
        }
      }
    })
    
    return NextResponse.json({ videos }, {
      headers: {
        'Cache-Control': 'private, s-maxage=300, stale-while-revalidate=60'
      }
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch video information' }, { status: 500 })
  }
}