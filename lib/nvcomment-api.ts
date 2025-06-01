// ニコニコ動画の最新コメントを取得するAPI

export interface LatestComment {
  body: string
  postedAt: string
}

// Googlebot UAでアクセス
async function fetchWithGooglebot(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja'
    }
  })
}

// 単一動画の最新コメント（複数）を取得
export async function fetchLatestComments(videoId: string): Promise<string[]> {
  try {
    // 1. 動画ページからthread情報を取得
    const watchUrl = `https://www.nicovideo.jp/watch/${videoId}`
    const pageResponse = await fetchWithGooglebot(watchUrl)
    
    if (!pageResponse.ok) {
      return []
    }
    
    const html = await pageResponse.text()
    
    // server-responseメタタグから情報を抽出
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    if (!metaMatch) {
      return []
    }
    
    const encodedData = metaMatch[1]
    if (!encodedData) {
      return []
    }
    const decodedData = encodedData
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
    
    const serverData = JSON.parse(decodedData)
    const nvComment = serverData.data?.response?.comment?.nvComment
    
    if (!nvComment || !nvComment.threadKey || !nvComment.params?.targets?.[0]?.id) {
      return []
    }
    
    // 2. nvComment APIを呼び出す
    const threadId = nvComment.params.targets[0].id
    
    const payload = {
      params: {
        targets: [
          { id: threadId, fork: 'owner' },
          { id: threadId, fork: 'main' },
          { id: threadId, fork: 'easy' }
        ],
        language: 'ja-jp'
      },
      threadKey: nvComment.threadKey,
      additionals: {}
    }
    
    const commentResponse = await fetch('https://public.nvcomment.nicovideo.jp/v1/threads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0'
      },
      body: JSON.stringify(payload)
    })
    
    if (!commentResponse.ok) {
      return []
    }
    
    const responseText = await commentResponse.text()
    const lines = responseText.trim().split('\n')
    
    // レスポンスから最新5件のコメントを探す
    const comments: string[] = []
    for (const line of lines) {
      try {
        const data = JSON.parse(line)
        if (data.data?.threads) {
          for (const thread of data.data.threads) {
            if (thread.comments && thread.comments.length > 0) {
              // 最新5件のコメントを取得（配列の最後から）
              const recentComments = thread.comments
                .slice(-5)
                .reverse()
                .map((comment: any) => comment.body)
              comments.push(...recentComments)
              if (comments.length >= 5) {
                return comments.slice(0, 5)
              }
            }
          }
        }
      } catch {
        // JSONパースエラーは無視
      }
    }
    
    return comments
  } catch (error) {
    console.error(`Failed to fetch comments for ${videoId}:`, error)
    return []
  }
}

// 複数動画の最新コメントを並列で取得
export async function fetchMultipleVideoComments(
  videoIds: string[]
): Promise<Record<string, string[]>> {
  const results: Record<string, string[]> = {}
  
  // バッチ処理（10個ずつ）
  const batchSize = 10
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize)
    
    // 並列で取得
    const promises = batch.map(async (videoId) => {
      const comments = await fetchLatestComments(videoId)
      if (comments.length > 0) {
        results[videoId] = comments
      }
    })
    
    await Promise.all(promises)
    
    // レート制限対策（次のバッチまで少し待つ）
    if (i + batchSize < videoIds.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  return results
}