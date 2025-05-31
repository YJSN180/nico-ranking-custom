import { scrapeRankingViaProxy } from '../lib/proxy-scraper'

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

async function getRandomTagRankings() {
  // ランダムにタグを選択
  const otherTag = popularTags['その他'][Math.floor(Math.random() * popularTags['その他'].length)]
  const reiSoreTag = popularTags['例のソレ'][Math.floor(Math.random() * popularTags['例のソレ'].length)]

  console.log(`\n選択されたタグ:`)
  console.log(`その他: ${otherTag}`)
  console.log(`例のソレ: ${reiSoreTag}`)

  // その他ジャンルのタグランキング取得
  console.log(`\n=== その他ジャンル「${otherTag}」の上位10動画 ===`)
  try {
    const otherRanking = await scrapeRankingViaProxy('ramuboyn', '24h', otherTag)
    if (otherRanking.items.length > 0) {
      otherRanking.items.slice(0, 10).forEach((item, index) => {
        console.log(`${index + 1}. ${item.title}`)
        console.log(`   ID: ${item.id}`)
        console.log(`   再生数: ${item.views?.toLocaleString() || 'N/A'}`)
        console.log(`   コメント数: ${item.comments?.toLocaleString() || 'N/A'}`)
        console.log(`   マイリスト数: ${item.mylists?.toLocaleString() || 'N/A'}`)
        console.log(`   いいね数: ${item.likes?.toLocaleString() || 'N/A'}`)
        console.log('')
      })
    } else {
      console.log('動画が見つかりませんでした')
    }
  } catch (error) {
    console.error('Error fetching その他 tag ranking:', error)
  }

  // 例のソレジャンルのタグランキング取得
  console.log(`\n=== 例のソレジャンル「${reiSoreTag}」の上位10動画 ===`)
  try {
    const reiSoreRanking = await scrapeRankingViaProxy('d2um7mc4', '24h', reiSoreTag)
    if (reiSoreRanking.items.length > 0) {
      reiSoreRanking.items.slice(0, 10).forEach((item, index) => {
        console.log(`${index + 1}. ${item.title}`)
        console.log(`   ID: ${item.id}`)
        console.log(`   再生数: ${item.views?.toLocaleString() || 'N/A'}`)
        console.log(`   コメント数: ${item.comments?.toLocaleString() || 'N/A'}`)
        console.log(`   マイリスト数: ${item.mylists?.toLocaleString() || 'N/A'}`)
        console.log(`   いいね数: ${item.likes?.toLocaleString() || 'N/A'}`)
        console.log('')
      })
    } else {
      console.log('動画が見つかりませんでした')
    }
  } catch (error) {
    console.error('Error fetching 例のソレ tag ranking:', error)
  }
}

getRandomTagRankings().catch(console.error)