// シンプルなWebスクレイピング実装（ハイブリッドなし）

import type { RankingItem } from '@/types/ranking'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export async function scrapeRankingFromWeb(
  genre: string,
  term: '24h' | 'hour',
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  // タグ付きURLの構築
  let url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
  if (tag) {
    url += `&tag=${encodeURIComponent(tag)}`
  }
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.9',
      'Cache-Control': 'no-cache'
    }
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ranking: ${response.status}`)
  }
  
  const html = await response.text()
  
  // 動画情報を抽出
  const items: Partial<RankingItem>[] = []
  
  // より堅牢なパターンマッチング
  // 動画リンクとIDを抽出
  const linkPattern = /<a[^>]+href="\/watch\/((?:sm|nm|so)\d+)"[^>]*>/g
  const videoIds: string[] = []
  let match
  
  while ((match = linkPattern.exec(html)) !== null) {
    if (!videoIds.includes(match[1])) {
      videoIds.push(match[1])
    }
  }
  
  // 各動画の詳細情報を抽出
  videoIds.forEach((videoId, index) => {
    // 動画IDを含む要素を探す
    const videoBlockRegex = new RegExp(
      `<[^>]*>.*?href="/watch/${videoId}".*?</[^>]*>`,
      'gs'
    )
    const blockMatch = html.match(videoBlockRegex)
    
    if (blockMatch) {
      const block = blockMatch[0]
      
      // タイトル抽出（複数のパターンを試す）
      let title = ''
      const titlePatterns = [
        /title="([^"]+)"/,
        /alt="([^"]+)"/,
        />([^<]+)</
      ]
      
      for (const pattern of titlePatterns) {
        const titleMatch = block.match(pattern)
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1]
          break
        }
      }
      
      // より広い範囲でサムネイルと再生数を探す
      const extendedBlockRegex = new RegExp(
        `<[^>]*>[\\s\\S]*?${videoId}[\\s\\S]*?</[^>]*>`,
        'g'
      )
      const extendedMatch = html.match(extendedBlockRegex)
      const searchBlock = extendedMatch ? extendedMatch[0] : block
      
      // サムネイル抽出
      let thumbURL = ''
      const thumbPatterns = [
        /src="(https?:\/\/[^"]+\.jpg[^"]*)"/,
        /data-src="(https?:\/\/[^"]+\.jpg[^"]*)"/,
        /data-original="(https?:\/\/[^"]+\.jpg[^"]*)"/
      ]
      
      for (const pattern of thumbPatterns) {
        const thumbMatch = searchBlock.match(pattern)
        if (thumbMatch && thumbMatch[1]) {
          thumbURL = thumbMatch[1]
          break
        }
      }
      
      // 再生数抽出
      let views = 0
      const viewPatterns = [
        /([\d,]+)\s*再生/,
        /<[^>]*class="[^"]*view[^"]*"[^>]*>[\s\S]*?([\d,]+)/,
        />再生:?\s*([\d,]+)</
      ]
      
      for (const pattern of viewPatterns) {
        const viewMatch = searchBlock.match(pattern)
        if (viewMatch && viewMatch[1]) {
          views = parseInt(viewMatch[1].replace(/,/g, ''), 10)
          break
        }
      }
      
      // HTMLエンティティをデコード
      title = title
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/^第\d+位[：:]/, '').trim()
      
      items.push({
        rank: index + 1,
        id: videoId,
        title,
        thumbURL,
        views
      })
    }
  })
  
  // 人気タグを抽出（もし存在すれば）
  const popularTags: string[] = []
  const tagPattern = /<a[^>]+class="[^"]*tag[^"]*"[^>]*>([^<]+)</g
  
  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[1].trim()
    if (tag && !popularTags.includes(tag) && popularTags.length < 20) {
      popularTags.push(tag)
    }
  }
  
  return {
    items: items.filter(item => item.id && item.title),
    popularTags
  }
}

// 追加のメタデータを取得（オプション）
export async function enrichWithMetadata(
  items: Partial<RankingItem>[]
): Promise<Partial<RankingItem>[]> {
  // Snapshot APIを使って一括でメタデータ取得
  const videoIds = items.map(item => item.id).filter(Boolean) as string[]
  
  if (videoIds.length === 0) return items
  
  const baseUrl = 'https://api.nicovideo.jp/api/v2/snapshot/video/contents/search'
  const batchSize = 50 // 一度に50件まで
  const enrichedItems = [...items]
  
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize)
    const videoIdString = batch.join(' OR ')
    
    const params = new URLSearchParams({
      q: videoIdString,
      targets: 'contentId',
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnailUrl,startTime',
      _limit: String(batch.length),
      _context: 'nicorankingapp'
    })
    
    try {
      const response = await fetch(`${baseUrl}?${params}`, {
        headers: { 'User-Agent': USER_AGENT }
      })
      
      if (response.ok) {
        const data = await response.json()
        
        if (data.data && Array.isArray(data.data)) {
          // メタデータをマップに変換
          const metadataMap = new Map(
            data.data.map((item: any) => [
              item.contentId,
              {
                title: item.title,
                thumbURL: item.thumbnailUrl?.large || item.thumbnailUrl?.middle || item.thumbnailUrl?.normal,
                views: item.viewCounter,
                comments: item.commentCounter,
                mylists: item.mylistCounter,
                likes: item.likeCounter,
                registeredAt: item.startTime
              }
            ])
          )
          
          // アイテムを更新
          enrichedItems.forEach((item, index) => {
            if (item.id && metadataMap.has(item.id)) {
              const metadata = metadataMap.get(item.id)
              enrichedItems[index] = {
                ...item,
                ...metadata,
                rank: item.rank // ランクは保持
              }
            }
          })
        }
      }
    } catch (error) {
      // エラーは無視して続行
    }
    
    // レート制限対策
    if (i + batchSize < videoIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return enrichedItems
}