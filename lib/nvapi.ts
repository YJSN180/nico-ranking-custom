// ニコニコ動画のnvapi（非公式API）を使用してタグランキングを取得

export interface NvapiRankingItem {
  contentId: string
  title: string
  viewCounter: number
  commentCounter: number
  mylistCounter: number
  likeCounter: number
  thumbnail: {
    url: string
    largeUrl?: string
  }
  registeredAt: string
  rank: number
}

// nvapiのレスポンス型
interface NvapiResponse {
  data: {
    items: Array<{
      contentId: string
      title: string
      viewCounter: number
      commentCounter: number
      mylistCounter: number
      likeCounter: number
      thumbnail: {
        url: string
        largeUrl?: string
      }
      registeredAt: string
    }>
  }
}

// タグランキングを取得
export async function fetchNvapiTagRanking(
  tag: string,
  genre?: string,
  period: '24h' | 'hour' = '24h',
  limit: number = 100
): Promise<NvapiRankingItem[]> {
  try {
    // nvapiのエンドポイント（仮想的なURL、実際のURLは調整が必要）
    const baseUrl = 'https://nvapi.nicovideo.jp/v1/search/tag'
    
    const params = new URLSearchParams({
      q: tag,
      limit: limit.toString(),
      sort: 'viewCount', // 再生数順
      period: period === '24h' ? 'day' : 'hour'
    })
    
    if (genre && genre !== 'all') {
      params.append('genre', genre)
    }
    
    const url = `${baseUrl}?${params}`
    
    // ニコニコアカウントのcookieが必要な場合はここで設定
    const headers: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': 'https://www.nicovideo.jp/'
    }
    
    // 環境変数からニコニコのcookieを取得（必要な場合）
    const nicoSession = process.env.NICO_SESSION_COOKIE
    if (nicoSession) {
      headers['Cookie'] = `user_session=${nicoSession}`
    }
    
    const response = await fetch(url, { headers })
    
    if (!response.ok) {
      throw new Error(`nvapi request failed: ${response.status}`)
    }
    
    const data: NvapiResponse = await response.json()
    
    return data.data.items.map((item, index) => ({
      ...item,
      rank: index + 1
    }))
    
  } catch (error) {
    // nvapiが失敗した場合はフォールバック（Snapshot APIなど）を使用
    throw new Error(`nvapi failed: ${error}`)
  }
}

// 人気タグを取得（nvapi経由）
export async function fetchNvapiPopularTags(
  genre: string = 'all',
  limit: number = 20
): Promise<string[]> {
  try {
    // 人気タグ取得のnvapiエンドポイント
    const baseUrl = 'https://nvapi.nicovideo.jp/v1/tags/popular'
    
    const params = new URLSearchParams({
      limit: limit.toString()
    })
    
    if (genre !== 'all') {
      params.append('genre', genre)
    }
    
    const url = `${baseUrl}?${params}`
    
    const headers: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': 'https://www.nicovideo.jp/'
    }
    
    const nicoSession = process.env.NICO_SESSION_COOKIE
    if (nicoSession) {
      headers['Cookie'] = `user_session=${nicoSession}`
    }
    
    const response = await fetch(url, { headers })
    
    if (!response.ok) {
      throw new Error(`nvapi popular tags request failed: ${response.status}`)
    }
    
    const data = await response.json()
    
    // レスポンス構造に応じて調整
    return data.data?.tags || getDefaultTagsForGenre(genre)
    
  } catch (error) {
    // フォールバック: 静的なタグリスト
    return getDefaultTagsForGenre(genre)
  }
}

// デフォルトタグ（nvapiが使えない場合のフォールバック）
function getDefaultTagsForGenre(genre: string): string[] {
  const defaultTags: Record<string, string[]> = {
    all: ['VOCALOID', 'ゲーム実況', 'アニメ', '歌ってみた', '東方', 'minecraft'],
    music_sound: ['VOCALOID', '歌ってみた', '演奏してみた', '初音ミク', '作業用BGM'],
    game: ['ゲーム実況', 'minecraft', 'ポケモン', 'スプラトゥーン', 'RTA'],
    anime: ['アニメ', 'MAD', 'OP', 'ED', '手描き'],
    entertainment: ['例のアレ', '音MAD', 'BB素材', 'ホロライブ', 'にじさんじ'],
    dance: ['踊ってみた', 'MMD', 'オリジナル振付', 'K-POP', 'コスプレ'],
    cooking: ['料理', 'レシピ', 'お菓子作り', 'パン作り', '時短料理'],
    animal: ['動物', 'ペット', '猫', '犬', '鳥', '癒し'],
    nature: ['自然', '風景', '旅行', 'キャンプ', '登山', '釣り'],
    sports: ['サッカー', '野球', 'バスケ', 'テニス', 'ゴルフ', 'スポーツ'],
    technology_craft: ['DIY', '工作', 'プログラミング', 'ガジェット', '作ってみた'],
    other: ['その他', '実験', 'チャレンジ', 'ドキュメンタリー']
  }
  
  return defaultTags[genre] || defaultTags.all || []
}