// GitHub Actionsで実行するランキング取得スクリプト

const { kv } = require('@vercel/kv')

// 人気タグをKVに保存する関数
async function savePopularTags(genre, tags) {
  if (tags && tags.length > 0) {
    const key = `popular-tags:${genre}`
    await kv.set(key, tags, { ex: 604800 }) // 7日間保持
    console.log(`💾 ${genre}の人気タグを保存: ${tags.slice(0, 5).join(', ')}...`)
  }
}

// server-response方式でランキングを取得
async function fetchRankingWithServerResponse(genre = 'all', tag = null, term = '24h') {
  const url = tag 
    ? `https://www.nicovideo.jp/ranking/genre/${genre}?tag=${encodeURIComponent(tag)}&term=${term}`
    : `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
    
  console.log(`📡 Fetching: ${url}`)
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja'
    }
  })
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  
  const html = await response.text()
  
  // server-responseメタタグを探す
  const match = html.match(/name="server-response"\s+content="([^"]+)"/)
  if (!match) {
    throw new Error('server-response not found')
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
    throw new Error('No ranking data found')
  }
  
  // server-responseから人気タグ（トレンドタグ）を抽出
  const popularTags = extractTrendTagsFromServerResponse(serverData)
  
  // 必要なデータのみ抽出（KV保存用に軽量化）
  return {
    genre: rankingData.featuredKey,
    label: rankingData.label,
    tag: rankingData.tag || tag,
    term,
    items: rankingData.items.map((item, index) => ({
      rank: index + 1,
      id: item.id,
      title: item.title,
      thumbURL: item.thumbnail?.url || '',
      views: item.count?.view || 0,
      comments: item.count?.comment || 0,
      mylists: item.count?.mylist || 0,
      likes: item.count?.like || 0,
      tags: item.tags || [],
      authorId: item.owner?.id || item.user?.id,
      authorName: item.owner?.name || item.user?.nickname || item.channel?.name,
      authorIcon: item.owner?.iconUrl || item.user?.iconUrl || item.channel?.iconUrl,
      registeredAt: item.registeredAt || item.startTime || item.createTime
    })),
    updatedAt: new Date().toISOString(),
    popularTags
  }
}

// server-responseのtrendTagsから人気タグを抽出
function extractTrendTagsFromServerResponse(serverData) {
  try {
    const trendTags = serverData.data?.response?.$getTeibanRankingFeaturedKeyAndTrendTags?.data?.trendTags
    
    if (!Array.isArray(trendTags)) {
      return []
    }
    
    return trendTags.filter((tag) => {
      return typeof tag === 'string' && tag.trim().length > 0
    })
  } catch (error) {
    return []
  }
}

// HTMLから人気タグを抽出
function extractPopularTagsFromHTML(html) {
  const tags = []
  
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

// 人気の組み合わせを定義（正しいジャンルIDを使用）
const POPULAR_COMBINATIONS = [
  // 総合
  { genre: 'e9uj2uks', tag: null, term: '24h' },
  { genre: 'e9uj2uks', tag: null, term: 'hour' },
  
  // ゲーム
  { genre: '4eet3ca4', tag: null, term: '24h' },
  { genre: '4eet3ca4', tag: null, term: 'hour' },
  
  // アニメ
  { genre: 'zc49b03a', tag: null, term: '24h' },
  { genre: 'zc49b03a', tag: null, term: 'hour' },
  
  // ボカロ
  { genre: 'dshv5do5', tag: null, term: '24h' },
  { genre: 'dshv5do5', tag: null, term: 'hour' },
  
  // 音声合成実況・解説・劇場
  { genre: 'e2bi9pt8', tag: null, term: '24h' },
  
  // エンタメ
  { genre: '8kjl94d9', tag: null, term: '24h' },
  
  // 音楽
  { genre: 'wq76qdin', tag: null, term: '24h' },
  
  // 歌ってみた
  { genre: '1ya6bnqd', tag: null, term: '24h' },
  
  // 踊ってみた
  { genre: '6yuf530c', tag: null, term: '24h' },
  
  // 演奏してみた
  { genre: '6r5jr8nd', tag: null, term: '24h' },
  
  // 解説・講座
  { genre: 'v6wdx6p5', tag: null, term: '24h' },
  
  // 料理
  { genre: 'lq8d5918', tag: null, term: '24h' },
  
  // 旅行・アウトドア
  { genre: 'k1libcse', tag: null, term: '24h' },
  
  // 自然
  { genre: '24aa8fkw', tag: null, term: '24h' },
  
  // 乗り物
  { genre: '3d8zlls9', tag: null, term: '24h' },
  
  // 技術・工作
  { genre: 'n46kcz9u', tag: null, term: '24h' },
  
  // 社会・政治・時事
  { genre: 'lzicx0y6', tag: null, term: '24h' },
  
  // MMD
  { genre: 'p1acxuoz', tag: null, term: '24h' },
  
  // VTuber
  { genre: '6mkdo4xd', tag: null, term: '24h' },
  
  // ラジオ
  { genre: 'oxzi6bje', tag: null, term: '24h' },
  
  // スポーツ
  { genre: '4w3p65pf', tag: null, term: '24h' },
  
  // 動物
  { genre: 'ne72lua2', tag: null, term: '24h' },
  
  // その他
  { genre: 'ramuboyn', tag: null, term: '24h' },
  { genre: 'ramuboyn', tag: null, term: 'hour' }
]

// メイン処理
async function main() {
  console.log('🚀 ランキング更新開始:', new Date().toLocaleString('ja-JP'))
  
  let updatedCount = 0
  let skippedCount = 0
  
  for (const combo of POPULAR_COMBINATIONS) {
    try {
      const key = `ranking:${combo.genre}:${combo.tag || 'all'}:${combo.term}`
      console.log(`\n🔍 処理中: ${key}`)
      
      // 既存データを取得
      const existing = await kv.get(key)
      
      // 新データを取得
      const newData = await fetchRankingWithServerResponse(combo.genre, combo.tag, combo.term)
      
      // 上位20件のIDで更新判定
      const newIds = newData.items.slice(0, 20).map(i => i.id).join(',')
      const oldIds = existing?.items?.slice(0, 20).map(i => i.id).join(',') || ''
      
      if (newIds !== oldIds) {
        console.log('✅ 更新を検出 - KVに保存')
        await kv.set(key, newData, { ex: 3600 }) // 1時間TTL
        updatedCount++
        
        // 人気タグも保存（タグなしランキングの場合のみ）
        if (!combo.tag && newData.popularTags) {
          await savePopularTags(combo.genre, newData.popularTags)
        }
      } else {
        console.log('⏭️ 変更なし - スキップ')
        skippedCount++
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1000))
      
    } catch (error) {
      console.error(`❌ エラー:`, error.message)
    }
  }
  
  console.log(`\n📊 完了: 更新 ${updatedCount}件, スキップ ${skippedCount}件`)
}

// エラーハンドリング付きで実行
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})