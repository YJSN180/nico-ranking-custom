import type { VideoStats } from './snapshot-api'

/**
 * Get video statistics from Cloudflare KV
 * @param videoIds Array of video IDs to fetch stats for
 * @returns Record of video ID to VideoStats, empty object on error
 */
export async function getVideoStatsFromKV(
  videoIds: string[]
): Promise<Record<string, VideoStats>> {
  // Return empty object for empty input
  if (videoIds.length === 0) {
    return {}
  }

  try {
    // Fetch from Cloudflare KV
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE_ID}/values/VIDEO_STATS_LATEST`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.CLOUDFLARE_KV_API_TOKEN}`
        }
      }
    )
    
    if (!response.ok) {
      return {}
    }
    
    // Parse uncompressed JSON data
    const text = await response.text()
    const data = JSON.parse(text)
    
    // Extract only requested video IDs
    const result: Record<string, VideoStats> = {}
    for (const id of videoIds) {
      if (data.stats && data.stats[id]) {
        result[id] = data.stats[id]
      }
    }
    
    return result
  } catch (error) {
    console.error('Failed to get stats from KV:', error)
    return {}
  }
}