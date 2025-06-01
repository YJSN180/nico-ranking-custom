// HTMLからランキングアイテムのタグを抽出する

export function extractItemTagsFromHTML(html: string): Map<string, string[]> {
  const tagsMap = new Map<string, string[]>()
  
  // パターン1: data-videoタグ内のtagsフィールド
  const dataVideoPattern = /<div[^>]+data-video="([^"]+)"/g
  let match
  
  while ((match = dataVideoPattern.exec(html)) !== null) {
    try {
      const encodedData = match[1]!
      const decodedData = encodedData
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
      
      const videoData = JSON.parse(decodedData)
      if (videoData.id && videoData.tags) {
        tagsMap.set(videoData.id, videoData.tags)
      }
    } catch {
      // パースエラーは無視
    }
  }
  
  // パターン2: 個別の動画ページへのリンクから推測
  // RankingItemタグ内のリンクを探す
  const itemPattern = /<article[^>]+class="[^"]*RankingMainItem[^"]*"[^>]*>[\s\S]*?<a[^>]+href="\/watch\/(sm\d+)"[^>]*>[\s\S]*?<\/article>/g
  
  while ((match = itemPattern.exec(html)) !== null) {
    const videoId = match[1]
    const itemHtml = match[0]
    
    // タグリンクを探す
    const tagPattern = /<a[^>]+href="\/tag\/([^"?]+)[^"]*"[^>]*class="[^"]*Tag[^"]*"[^>]*>([^<]+)<\/a>/g
    const tags: string[] = []
    let tagMatch
    
    while ((tagMatch = tagPattern.exec(itemHtml)) !== null) {
      const tag = decodeURIComponent(tagMatch[1]!).replace(/\+/g, ' ')
      if (!tags.includes(tag)) {
        tags.push(tag)
      }
    }
    
    if (tags.length > 0 && videoId) {
      tagsMap.set(videoId, tags)
    }
  }
  
  return tagsMap
}

// ランキングデータにタグ情報を追加
export function enrichRankingItemsWithTags(items: any[], html: string): any[] {
  const tagsMap = extractItemTagsFromHTML(html)
  
  return items.map(item => ({
    ...item,
    tags: tagsMap.get(item.id) || item.tags || []
  }))
}