// 内部プロキシAPI経由でタグランキングを取得

const popularTags = {
  'その他': [
    '拓也さん', '替え歌拓也', '変態糞親父', 'AIのべりすと', 'ゆるキャラ',
    'VOICEVOX', '大規模言語モデル', 'ChatGPT', 'コメディ', 'ご当地グルメ'
  ],
  '例のソレ': [
    'R-18', '紳士向け', 'MMD', 'ボイロAV', '巨乳', 'エロゲ', 'お●ぱい',
    '東方', 'ゲーム実況', 'バーチャルYouTuber'
  ]
}

interface NvapiRankingResponse {
  meta: { status: number }
  data: {
    items: Array<{
      title: string
      id: string
      count: {
        view: number
        comment: number
        mylist: number
        like: number
      }
      owner?: {
        name: string
        id: string
        iconUrl: string
      }
      thumbnail?: {
        url?: string
        largeUrl?: string
      }
    }>
  }
}

async function getTagRankingViaNvapi(genre: string, tag: string): Promise<NvapiRankingResponse | null> {
  const internalProxyUrl = 'http://localhost:3000/api/internal-proxy'
  
  try {
    // nvapiのタグランキングエンドポイント
    const nvapiUrl = `https://nvapi.nicovideo.jp/v1/search/video?q=${encodeURIComponent(tag)}&targets=tags&fields=contentId,title,userId,channelId,viewCounter,commentCounter,mylistCounter,likeCounter,lengthSeconds,thumbnailUrl,ownerName,ownerIconUrl,startTime,description&filters[genre][0]=${genre}&_sort=-viewCounter&_limit=10`
    
    const response = await fetch(internalProxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'internal-key'
      },
      body: JSON.stringify({
        url: nvapiUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'ja',
          'Origin': 'https://www.nicovideo.jp',
          'Referer': 'https://www.nicovideo.jp/',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Cookie': 'user_session=user_session_54116935_56e7cd07bafc0c91b4e87baec017fe86bc64e014cf01c1f5cf07eaf02f0503f6; sensitive_material_status=accept'
        }
      })
    })
    
    if (!response.ok) {
      console.error('Proxy request failed:', response.status, response.statusText)
      return null
    }
    
    const proxyResponse = await response.json()
    if (proxyResponse.status !== 200) {
      console.error('Target request failed:', proxyResponse.status)
      return null
    }
    
    // レスポンスをパース
    const data = JSON.parse(proxyResponse.body)
    
    // 検索APIのレスポンス形式をランキング形式に変換
    if (data.data && Array.isArray(data.data)) {
      return {
        meta: { status: 200 },
        data: {
          items: data.data.map((item: any) => ({
            id: item.contentId,
            title: item.title,
            count: {
              view: item.viewCounter || 0,
              comment: item.commentCounter || 0,
              mylist: item.mylistCounter || 0,
              like: item.likeCounter || 0
            },
            owner: item.ownerName ? {
              name: item.ownerName,
              id: item.userId || item.channelId || '',
              iconUrl: item.ownerIconUrl || ''
            } : undefined,
            thumbnail: {
              url: item.thumbnailUrl,
              largeUrl: item.thumbnailUrl?.replace('.M', '.L')
            }
          }))
        }
      }
    }
    
    return data
  } catch (error) {
    console.error('Error fetching via nvapi:', error)
    return null
  }
}

async function getRandomTagRankings() {
  // ランダムにタグを選択
  const otherTag = popularTags['その他'][Math.floor(Math.random() * popularTags['その他'].length)]
  const reiSoreTag = popularTags['例のソレ'][Math.floor(Math.random() * popularTags['例のソレ'].length)]

  console.log(`\n選択されたタグ:`)
  console.log(`その他: ${otherTag}`)
  console.log(`例のソレ: ${reiSoreTag}`)

  // その他ジャンルのタグランキング取得
  console.log(`\n=== その他ジャンル「${otherTag}」の上位10動画 ===`)
  const otherRanking = await getTagRankingViaNvapi('ramuboyn', otherTag)
  if (otherRanking && otherRanking.data.items.length > 0) {
    otherRanking.data.items.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title}`)
      console.log(`   ID: ${item.id}`)
      console.log(`   再生数: ${item.count.view.toLocaleString()}`)
      console.log(`   コメント数: ${item.count.comment.toLocaleString()}`)
      console.log(`   マイリスト数: ${item.count.mylist.toLocaleString()}`)
      console.log(`   いいね数: ${item.count.like.toLocaleString()}`)
      if (item.owner) {
        console.log(`   投稿者: ${item.owner.name}`)
      }
      console.log('')
    })
  } else {
    console.log('動画が見つかりませんでした')
  }

  // 例のソレジャンルのタグランキング取得
  console.log(`\n=== 例のソレジャンル「${reiSoreTag}」の上位10動画 ===`)
  const reiSoreRanking = await getTagRankingViaNvapi('d2um7mc4', reiSoreTag)
  if (reiSoreRanking && reiSoreRanking.data.items.length > 0) {
    reiSoreRanking.data.items.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title}`)
      console.log(`   ID: ${item.id}`)
      console.log(`   再生数: ${item.count.view.toLocaleString()}`)
      console.log(`   コメント数: ${item.count.comment.toLocaleString()}`)
      console.log(`   マイリスト数: ${item.count.mylist.toLocaleString()}`)
      console.log(`   いいね数: ${item.count.like.toLocaleString()}`)
      if (item.owner) {
        console.log(`   投稿者: ${item.owner.name}`)
      }
      console.log('')
    })
  } else {
    console.log('動画が見つかりませんでした')
  }
}

getRandomTagRankings().catch(console.error)