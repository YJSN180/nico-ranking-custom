// ニコニコ動画のSnapshot API v2を使用して動画情報を取得

export interface VideoInfo {
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
  lengthSeconds: number
  tags?: string[]
}

export interface TagRankingItem {
  rank: number
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
  tags: string[]
  registeredAt: string
}

// Snapshot API v2のレスポンス型
interface SnapshotResponse {
  data: Array<{
    contentId: string
    title: string
    viewCounter: number
    commentCounter: number
    mylistCounter: number
    likeCounter: number
    thumbnail: {
      url: string
      nHdUrl?: string
      largeUrl?: string
    }
    registeredAt: string
    lengthSeconds: number
    tags?: string[]
    categoryTags?: string[]
  }>
}

// 複数の動画情報を一括取得
export async function fetchVideoInfoBatch(contentIds: string[]): Promise<Map<string, VideoInfo>> {
  const videoInfoMap = new Map<string, VideoInfo>()
  
  // 空の配列の場合は空のMapを返す
  if (contentIds.length === 0) {
    return videoInfoMap
  }

  // Snapshot API v2のエンドポイント
  const url = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/version'
  
  try {
    // まずAPIのバージョンを確認
    const versionResponse = await fetch(url)
    if (!versionResponse.ok) {
      throw new Error(`API version check failed: ${versionResponse.status}`)
    }

    // 動画情報を取得（最大100件まで）
    const batchSize = 100
    for (let i = 0; i < contentIds.length; i += batchSize) {
      const batch = contentIds.slice(i, i + batchSize)
      const query = {
        q: batch.map(id => `contentId:${id}`).join(' OR '),
        targets: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnail,registeredAt,lengthSeconds',
        fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnail,registeredAt,lengthSeconds',
        _limit: batch.length.toString()
      }

      const searchUrl = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?${new URLSearchParams(query)}`
      const response = await fetch(searchUrl)
      
      if (!response.ok) {
        // Failed to fetch video info, skip this batch
        continue
      }

      const data: SnapshotResponse = await response.json()
      
      // 結果をMapに格納
      data.data.forEach(video => {
        videoInfoMap.set(video.contentId, {
          contentId: video.contentId,
          title: video.title,
          viewCounter: video.viewCounter,
          commentCounter: video.commentCounter,
          mylistCounter: video.mylistCounter,
          likeCounter: video.likeCounter || 0, // いいね数は比較的新しい機能なので0の場合がある
          thumbnail: {
            url: video.thumbnail.url,
            largeUrl: video.thumbnail.largeUrl
          },
          registeredAt: video.registeredAt,
          lengthSeconds: video.lengthSeconds,
          tags: video.tags
        })
      })
    }
  } catch (error) {
    // エラーが発生しても空のMapを返す（フォールバック）
  }

  return videoInfoMap
}

// タグでランキング検索
export async function fetchTagRanking(
  tag: string,
  genre?: string,
  period: '24h' | 'hour' = '24h',
  limit: number = 100
): Promise<TagRankingItem[]> {
  try {
    // 期間の設定
    const now = new Date()
    const startTime = new Date()
    if (period === '24h') {
      startTime.setDate(now.getDate() - 1)
    } else {
      startTime.setHours(now.getHours() - 1)
    }

    // 基本のクエリパラメータ
    const params: any = {
      q: tag,
      targets: 'tagsExact',  // 正確なタグ一致
      fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnail,tags,categoryTags,registeredAt',
      _sort: '-viewCounter',  // 再生数の降順でソート
      _limit: limit.toString()
    }

    // 期間フィルターを追加
    params['filters[startTime][gte]'] = startTime.toISOString()
    params['filters[startTime][lt]'] = now.toISOString()
    
    // ジャンルフィルターの追加
    if (genre && genre !== 'all') {
      // categoryTagsでジャンルを絞り込む
      params['filters[categoryTags][0]'] = genre
    }

    const searchUrl = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'
    const queryString = new URLSearchParams(params).toString()
    const fullUrl = `${searchUrl}?${queryString}`
    
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'nico-ranking-app/1.0'  // 40文字以内の必須ヘッダー
      }
    })
    
    if (!response.ok) {
      throw new Error(`Tag ranking search failed: ${response.status}`)
    }

    const data: SnapshotResponse = await response.json()
    
    // ランキング形式に変換
    const tagRanking: TagRankingItem[] = data.data.map((video, index) => ({
      rank: index + 1,
      contentId: video.contentId,
      title: video.title,
      viewCounter: video.viewCounter,
      commentCounter: video.commentCounter,
      mylistCounter: video.mylistCounter,
      likeCounter: video.likeCounter || 0,
      thumbnail: {
        url: video.thumbnail.url,
        largeUrl: video.thumbnail.largeUrl
      },
      tags: video.tags || [],
      registeredAt: video.registeredAt
    }))

    return tagRanking
    
  } catch (error) {
    return []
  }
}

// ジャンルの人気タグを取得
export async function fetchPopularTags(genre: string = 'all', limit: number = 20): Promise<string[]> {
  try {
    // 現在の動画から人気タグを取得（再生数が多い動画のタグを集計）
    const params: any = {
      q: '*',  // すべての動画
      targets: 'title',  // titleフィールドで検索
      fields: 'tags,viewCounter,categoryTags',
      _sort: '-viewCounter',  // 再生数の多い順
      _limit: '200'  // 上位200件から集計
    }
    
    // ジャンルフィルター
    if (genre !== 'all') {
      params['filters[categoryTags][0]'] = genre
    }

    const searchUrl = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'
    const queryString = new URLSearchParams(params).toString()
    const fullUrl = `${searchUrl}?${queryString}`
    
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'nico-ranking-app/1.0'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Popular tags search failed: ${response.status}`)
    }

    const data: SnapshotResponse = await response.json()
    
    // タグの出現回数を集計（再生数で重み付け）
    const tagScores = new Map<string, number>()
    
    data.data.forEach(video => {
      if (video.tags && Array.isArray(video.tags)) {
        video.tags.forEach(tag => {
          if (typeof tag === 'string' && tag.length > 0) {
            const currentScore = tagScores.get(tag) || 0
            // 再生数の対数で重み付け（人気動画のタグをより重視）
            const weight = Math.log10(video.viewCounter + 1)
            tagScores.set(tag, currentScore + weight)
          }
        })
      }
    })

    // スコアの高い順でソートして上位を返す
    const sortedTags = Array.from(tagScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .filter(tag => !tag.includes('R-18') && !tag.includes('R18'))  // R-18タグを除外
      .slice(0, limit)

    return sortedTags.length > 0 ? sortedTags : getDefaultPopularTags(genre)
    
  } catch (error) {
    // フォールバック: ジャンルごとの基本的な人気タグ
    return getDefaultPopularTags(genre)
  }
}

// デフォルトの人気タグ（APIが使えない場合のフォールバック）
function getDefaultPopularTags(genre: string): string[] {
  const defaultTags: Record<string, string[]> = {
    all: ['VOCALOID', 'ゲーム実況', 'アニメ', '歌ってみた', '東方', 'minecraft', '料理', 'ゆっくり実況'],
    music_sound: ['VOCALOID', '歌ってみた', '演奏してみた', '作業用BGM', 'ボカロオリジナル', '初音ミク', 'UTAU'],
    game: ['ゲーム実況', 'minecraft', 'ゆっくり実況', 'ポケモン', 'スプラトゥーン', 'ApexLegends', 'モンハン'],
    anime: ['アニメ', 'MAD', 'AMV', 'OP', 'ED', '鬼滅の刃', 'ワンピース'],
    entertainment: ['歌ってみた', '踊ってみた', 'コメディ', 'バラエティ', 'ものまね'],
    cooking: ['料理', 'レシピ', 'お菓子作り', 'パン作り', '時短料理', 'ダイエット'],
    nature: ['動物', 'ペット', '猫', '犬', '鳥', '自然', '癒し'],
    dance: ['踊ってみた', 'ダンス', 'ボカロダンス', 'K-POP', 'アイドル'],
    sports: ['サッカー', '野球', 'バスケ', 'テニス', 'ゴルフ', 'スポーツ'],
    technology_craft: ['DIY', '工作', 'プログラミング', 'ガジェット', '作ってみた'],
    other: ['その他', '実験', 'チャレンジ', 'ドキュメンタリー']
  }
  
  return defaultTags[genre] || defaultTags.all || []
}