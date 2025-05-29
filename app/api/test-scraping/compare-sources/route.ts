import { NextResponse } from 'next/server'
import { fetchNicoRanking } from '@/lib/fetch-rss'
import { scrapeRankingPage } from '@/lib/scraper'

export async function GET() {
  try {
    // Fetch data from both sources
    const [rssData, nvapiData] = await Promise.all([
      fetchNicoRanking('24h', 'all'),
      scrapeRankingPage('all', '24h')
    ])
    
    // Create maps for easy comparison
    const rssMap = new Map(rssData.map(item => [item.id, item]))
    const nvapiMap = new Map(nvapiData.items.map(item => [item.id!, item]))
    
    // Find videos in RSS but not in nvapi
    const missingInNvapi = rssData.filter(item => !nvapiMap.has(item.id))
    
    // Find videos in nvapi but not in RSS  
    const missingInRss = nvapiData.items.filter(item => !rssMap.has(item.id!))
    
    // Analyze the missing videos
    const missingAnalysis = await Promise.all(
      missingInNvapi.map(async (item) => {
        // Try to fetch individual video details
        let videoDetails = null
        try {
          const response = await fetch(`https://nvapi.nicovideo.jp/v1/video/${item.id}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
              'X-Frontend-Id': '6',
              'X-Frontend-Version': '0',
              'Referer': `https://www.nicovideo.jp/watch/${item.id}`
            }
          })
          
          if (response.ok) {
            const data = await response.json()
            videoDetails = {
              status: data.meta?.status,
              isPrivate: data.data?.video?.isPrivate,
              isDeleted: data.data?.video?.isDeleted,
              isChannelVideo: data.data?.video?.isChannelVideo,
              isOfficialChannelVideo: data.data?.video?.isOfficialChannelVideo,
              isPremium: data.data?.video?.isPremium,
              isR18: data.data?.video?.isR18,
              tags: data.data?.tag?.items?.map((tag: any) => tag.name),
              requireSensitiveAuth: data.data?.video?.requireSensitiveAuth,
              deviceFilter: data.data?.video?.deviceFilter,
              registeredAt: data.data?.video?.registeredAt,
              count: data.data?.video?.count
            }
          }
        } catch (error) {
          // ignore
        }
        
        return {
          ...item,
          videoDetails,
          titleContainsSensitiveKeywords: checkSensitiveKeywords(item.title)
        }
      })
    )
    
    return NextResponse.json({
      stats: {
        rssCount: rssData.length,
        nvapiCount: nvapiData.items.length,
        missingInNvapiCount: missingInNvapi.length,
        missingInRssCount: missingInRss.length
      },
      missingInNvapi: missingAnalysis,
      missingInRss: missingInRss.slice(0, 10), // Limit to first 10
      comparison: {
        rssTop10: rssData.slice(0, 10).map(item => ({
          rank: item.rank,
          id: item.id,
          title: item.title
        })),
        nvapiTop10: nvapiData.items.slice(0, 10).map(item => ({
          rank: item.rank,
          id: item.id,
          title: item.title
        }))
      }
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

function checkSensitiveKeywords(title: string): boolean {
  const sensitiveKeywords = [
    'ドッキリ', '静電気', 'パンツ', '下着', 'エロ', 'R18',
    'グロ', '暴力', '殺', '死', 'ショック', '閲覧注意',
    '18禁', 'NSFW', 'センシティブ', '規制', '削除'
  ]
  
  const lowerTitle = title.toLowerCase()
  return sensitiveKeywords.some(keyword => 
    title.includes(keyword) || lowerTitle.includes(keyword.toLowerCase())
  )
}