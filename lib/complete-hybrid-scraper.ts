// server-response方式の完全なランキング取得実装
// 例のソレジャンルは除外し、通常のジャンルのみ対応

export interface RankingItem {
  rank: number
  id: string
  title: string
  thumbURL: string
  views: number
}

export interface RankingData {
  genre: string
  label: string
  tag: string | null
  term: string
  items: RankingItem[]
  updatedAt: string
  popularTags?: string[]
}

// Node.js環境でのfetchが利用できない場合があるため、条件付きでインポート
const fetchImpl = typeof fetch !== 'undefined' 
  ? fetch 
  : typeof global !== 'undefined' && typeof require !== 'undefined'
  ? require('node-fetch')
  : (url: string, options?: any) => {
      // フォールバック: エラーを投げる
      throw new Error('fetch is not available in this environment')
    }

// Googlebot UAを使用してジオブロックを回避
const USER_AGENT = 'Googlebot/2.1 (+http://www.google.com/bot.html)'

// ジャンル定義
export const GENRES = {
  all: { id: 'all', label: '総合' },
  game: { id: '4eet3ca4', label: 'ゲーム' },
  anime: { id: 'zc49b03a', label: 'アニメ' },
  vocaloid: { id: 'dshv5do5', label: 'ボカロ' },
  vtuber: { id: 'e2bi9pt8', label: '音声合成実況・解説・劇場' },
  entertainment: { id: '8kjl94d9', label: 'エンタメ' },
  music: { id: 'wq76qdin', label: '音楽' },
  sing: { id: '1ya6bnqd', label: '歌ってみた' },
  dance: { id: '6yuf530c', label: '踊ってみた' },
  play: { id: '6r5jr8nd', label: '演奏してみた' },
  lecture: { id: 'v6wdx6p5', label: '解説・講座' },
  cooking: { id: 'lq8d5918', label: '料理' },
  travel: { id: 'k1libcse', label: '旅行・アウトドア' },
  nature: { id: '24aa8fkw', label: '自然' },
  vehicle: { id: '3d8zlls9', label: '乗り物' },
  tech: { id: 'n46kcz9u', label: '技術・工作' },
  society: { id: 'lzicx0y6', label: '社会・政治・時事' },
  mmd: { id: 'p1acxuoz', label: 'MMD' },
  other: { id: 'ramuboyn', label: 'その他' }
  // 例のソレ（d2um7mc4）は除外
}

// 人気タグの定義
export const POPULAR_TAGS: Record<string, string[]> = {
  '4eet3ca4': ['ゆっくり実況', 'VOICEROID実況', '東方', 'ゲーム実況', 'RTA'],
  'zc49b03a': ['アニメ', 'MAD', 'アニソン', '音MAD'],
  'dshv5do5': ['初音ミク', 'GUMI', '重音テト', 'KAITO', 'MEIKO'],
  'ramuboyn': ['ChatGPT', '大規模言語モデル', 'AIのべりすと', 'VOICEVOX', '拓也さん'],
  // 他のジャンルも必要に応じて追加
}

// Googlebot User-Agentでフェッチ
async function fetchWithGooglebot(url: string): Promise<string> {
  const response = await fetchImpl(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
    }
  })
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  return response.text()
}

// server-responseメタタグからランキングデータを抽出
function parseServerResponse(html: string, term: string, tag: string | null = null): RankingData & { popularTags?: string[] } {
  const match = html.match(/name="server-response"\s+content="([^"]+)"/)
  if (!match) {
    throw new Error('server-response meta tag not found')
  }
  
  // HTMLエンティティをデコード
  const decoded = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
  
  const serverData = JSON.parse(decoded)
  const rankingData = serverData.data?.response?.$getTeibanRanking?.data
  
  if (!rankingData?.items) {
    throw new Error('No ranking data found in server response')
  }
  
  // HTMLから人気タグを抽出
  const popularTags = extractPopularTagsFromHTML(html)
  
  // 必要なデータのみ抽出
  return {
    genre: rankingData.featuredKey,
    label: rankingData.label,
    tag: tag,
    term: term,
    items: rankingData.items.map((item: any, index: number) => ({
      rank: index + 1,
      id: item.id,
      title: item.title,
      thumbURL: item.thumbnail?.url || '',
      views: item.count?.view || 0
    })),
    updatedAt: new Date().toISOString(),
    popularTags
  }
}

// HTMLから人気タグを抽出
function extractPopularTagsFromHTML(html: string): string[] {
  const tags: string[] = []
  
  // パターン1: class="PopularTag"を持つ要素
  const tagPattern1 = /<a[^>]+class="[^"]*PopularTag[^"]*"[^>]*>([^<]+)</g
  let match
  
  while ((match = tagPattern1.exec(html)) !== null) {
    if (match[1]) {
      const tag = match[1].trim()
      if (tag && !tags.includes(tag) && tag !== 'すべて') {
        tags.push(tag)
      }
    }
  }
  
  // パターン2: RankingMainContainer内のタグリスト
  if (tags.length === 0) {
    const tagAreaMatch = html.match(/class="[^"]*RankingMainContainer[^"]*"[\s\S]*?<\/section>/i)
    if (tagAreaMatch) {
      const tagArea = tagAreaMatch[0]
      const tagPattern2 = /<a[^>]*href="[^"]*\?tag=([^"&]+)[^"]*"[^>]*>([^<]+)</g
      
      while ((match = tagPattern2.exec(tagArea)) !== null) {
        if (match[2]) {
          const tag = match[2].trim()
          if (tag && !tags.includes(tag) && tag !== 'すべて') {
            tags.push(tag)
          }
        }
      }
    }
  }
  
  return tags.slice(0, 20) // 最大20個まで
}

// メインのランキング取得関数
export async function fetchRanking(
  genreId: string,
  tag: string | null = null,
  term: string = '24h'
): Promise<RankingData> {
  // 例のソレジャンルは除外
  if (genreId === 'd2um7mc4') {
    throw new Error('例のソレジャンルは対応していません')
  }
  
  // URLを構築
  const url = tag
    ? `https://www.nicovideo.jp/ranking/genre/${genreId}?tag=${encodeURIComponent(tag)}&term=${term}`
    : `https://www.nicovideo.jp/ranking/genre/${genreId}?term=${term}`
  
  console.log(`📡 Fetching: ${url}`)
  
  try {
    const html = await fetchWithGooglebot(url)
    const data = parseServerResponse(html, term, tag)
    
    return data
  } catch (error) {
    console.error(`❌ Failed to fetch ranking: ${error}`)
    throw error
  }
}

// 複数のランキングを並列で取得
export async function fetchMultipleRankings(
  combinations: Array<{ genre: string; tag: string | null; term: string }>
): Promise<RankingData[]> {
  const promises = combinations.map(combo =>
    fetchRanking(combo.genre, combo.tag, combo.term)
      .catch(error => {
        console.error(`Failed to fetch ${combo.genre}/${combo.tag}/${combo.term}:`, error)
        return null
      })
  )
  
  const results = await Promise.all(promises)
  return results.filter((data): data is RankingData => data !== null)
}

// 人気の組み合わせを定義
export const DEFAULT_COMBINATIONS = [
  // 総合
  { genre: 'all', tag: null, term: '24h' },
  { genre: 'all', tag: null, term: 'hour' },
  { genre: 'all', tag: null, term: 'week' },
  
  // ゲーム
  { genre: '4eet3ca4', tag: null, term: '24h' },
  { genre: '4eet3ca4', tag: 'ゆっくり実況', term: '24h' },
  { genre: '4eet3ca4', tag: 'VOICEROID実況', term: '24h' },
  
  // アニメ
  { genre: 'zc49b03a', tag: null, term: '24h' },
  { genre: 'zc49b03a', tag: 'アニメ', term: '24h' },
  
  // その他
  { genre: 'ramuboyn', tag: null, term: '24h' },
  { genre: 'ramuboyn', tag: 'ChatGPT', term: '24h' },
  { genre: 'ramuboyn', tag: '大規模言語モデル', term: '24h' }
]