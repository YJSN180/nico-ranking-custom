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

  // Validate required environment variables
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.warn('[video-stats-kv] Missing Cloudflare credentials:', {
      hasAccountId: Boolean(CF_ACCOUNT_ID),
      hasNamespaceId: Boolean(CF_NAMESPACE_ID),
      hasApiToken: Boolean(CF_API_TOKEN)
    })
    return {}
  }

  try {
    // Fetch from Cloudflare KV
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/VIDEO_STATS_LATEST`,
      {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`
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