// getthumbinfo APIを使用してタグを取得

// Validate video ID format (sm/nm/so + numbers)
const VIDEO_ID_REGEX = /^(sm|nm|so)\d+$/

export async function fetchVideoTags(videoIds: string[]): Promise<Record<string, string[]>> {
  const tags: Record<string, string[]> = {}
  
  // Validate and filter video IDs to prevent SSRF
  const validVideoIds = videoIds.filter(id => VIDEO_ID_REGEX.test(id))
  
  // バッチ処理（一度に最大5個）
  const batchSize = 5
  for (let i = 0; i < validVideoIds.length; i += batchSize) {
    const batch = validVideoIds.slice(i, i + batchSize)
    
    try {
      // 各動画のタグを並行取得
      const promises = batch.map(async (videoId) => {
        try {
          const response = await fetch(`https://ext.nicovideo.jp/api/getthumbinfo/${videoId}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            }
          })
          
          if (response.ok) {
            const xmlText = await response.text()
            
            // XMLからタグを抽出
            const tagMatches = xmlText.match(/<tag[^>]*>([^<]+)<\/tag>/g)
            if (tagMatches) {
              const videoTags = tagMatches.map(match => {
                const tagContent = match.match(/>([^<]+)</)?.[1]
                return tagContent
              }).filter((tag): tag is string => tag !== undefined)
              
              return { videoId, tags: videoTags }
            }
          }
          
          return null
        } catch (error) {
          // 個別のエラーは無視（ログは記録）
          console.error(`Failed to fetch tags for video ${videoId}:`, error)
          return null
        }
      })
      
      const results = await Promise.all(promises)
      
      // 結果をマージ
      results.forEach(result => {
        if (result) {
          tags[result.videoId] = result.tags
        }
      })
      
    } catch (error) {
      // バッチエラーは静かに処理（ログは記録）
      console.error(`Failed to process batch starting at index ${i}:`, error)
    }
    
    // レート制限対策（100ms待機）
    if (i + batchSize < validVideoIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return tags
}