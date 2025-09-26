import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

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

export async function POST(request: NextRequest) {
  // Basic authentication check
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
    
    // Map API response to VideoInfo
    if (data.data && Array.isArray(data.data)) {
      for (const video of data.data) {
        foundVideos.push({
          id: video.contentId,
          title: video.title || 'タイトル不明',
          authorName: `投稿者ID: ${video.channelId || video.userId || '不明'}`,
          url: `https://www.nicovideo.jp/watch/${video.contentId}`,
          viewCount: video.viewCounter || 0,
          commentCount: video.commentCounter || 0,
          mylistCount: video.mylistCounter || 0,
          likeCount: video.likeCounter || 0
        })
      }
    }
    
    // Return map of video ID to video info
    const videoMap: Record<string, VideoInfo | null> = {}
    
    // Initialize all requested IDs as null
    for (const id of videoIds) {
      videoMap[id] = null
    }
    
    // Fill in found videos
    for (const video of foundVideos) {
      videoMap[video.id] = video
    }
    
    return NextResponse.json({ videos: videoMap })
  } catch (error) {
    console.error('Error fetching video info:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}