// 認証情報を使用してタグランキングを取得

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

interface VideoItem {
  id: string
  title: string
  count: {
    view: number
    comment: number
    mylist: number
    like: number
  }
  owner?: {
    name: string
  }
}

async function fetchTagRankingWithAuth(genre: string, tag: string): Promise<VideoItem[]> {
  const url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=24h&tag=${encodeURIComponent(tag)}`
  
  console.log(`Fetching: ${url}`)
  
  // 提供されたCookie認証情報
  const cookies = [
    'nicosid=1748556307.3813877752',
    'user_session=user_session_54116935_56e7cd07bafc0c91b4e87baec017fe86bc64e014cf01c1f5cf07eaf02f0503f6',
    'sensitive_material_status=accept'
  ].join('; ')
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Cookie': cookies
      }
    })
    
    console.log(`Response status: ${response.status}`)
    console.log(`Final URL: ${response.url}`)
    
    if (!response.ok) {
      console.error('Failed to fetch:', response.status, response.statusText)
      return []
    }
    
    const html = await response.text()
    
    // meta name="server-response"からデータを抽出
    const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
    if (!metaMatch) {
      console.log('server-response meta tag not found')
      return []
    }
    
    // HTMLエンティティをデコード
    const encodedData = metaMatch[1]
    const decodedData = encodedData
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
    
    // JSONをパース
    const jsonData = JSON.parse(decodedData)
    
    // ランキングデータを取得
    const rankingData = jsonData?.data?.response?.$getTeibanRanking?.data
    
    console.log(`Label: ${rankingData?.label}`)
    console.log(`Tag: ${rankingData?.tag || 'なし'}`)
    
    if (!rankingData?.items || !Array.isArray(rankingData.items)) {
      console.log('No ranking data found in response')
      return []
    }
    
    console.log(`Found ${rankingData.items.length} items`)
    
    // 最初の10件を返す
    return rankingData.items.slice(0, 10).map((item: any) => ({
      id: item.id,
      title: item.title,
      count: {
        view: item.count?.view || 0,
        comment: item.count?.comment || 0,
        mylist: item.count?.mylist || 0,
        like: item.count?.like || 0
      },
      owner: item.owner ? {
        name: item.owner.name
      } : undefined
    }))
    
  } catch (error) {
    console.error('Error fetching ranking:', error)
    return []
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
  const otherItems = await fetchTagRankingWithAuth('ramuboyn', otherTag)
  if (otherItems.length > 0) {
    otherItems.forEach((item, index) => {
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
  const reiSoreItems = await fetchTagRankingWithAuth('d2um7mc4', reiSoreTag)
  if (reiSoreItems.length > 0) {
    reiSoreItems.forEach((item, index) => {
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