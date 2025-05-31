// タグランキングのサンプルデータを表示

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

// サンプルデータ（実際のAPIレスポンス構造に基づく）
const sampleRankings = {
  'その他': {
    '拓也さん': [
      { id: 'sm43456789', title: '拓也さんがついに〇〇してみた結果www', views: 156789, comments: 2345, mylists: 456, likes: 3210 },
      { id: 'sm43456123', title: '【拓也さん】今度は△△に挑戦してみた', views: 98765, comments: 1234, mylists: 234, likes: 1567 },
      { id: 'sm43455678', title: '拓也さん vs 野獣先輩 壮絶バトル', views: 87654, comments: 987, mylists: 198, likes: 1432 },
      { id: 'sm43454321', title: '拓也さんの日常 #123', views: 76543, comments: 876, mylists: 176, likes: 1234 },
      { id: 'sm43453210', title: '【MAD】拓也さん×人気アニメ', views: 65432, comments: 765, mylists: 154, likes: 1098 },
      { id: 'sm43452109', title: '拓也さんがプロゲーマーに挑戦した結果', views: 54321, comments: 654, mylists: 132, likes: 987 },
      { id: 'sm43451098', title: '【実況】拓也さんと行く世界旅行', views: 43210, comments: 543, mylists: 110, likes: 876 },
      { id: 'sm43450987', title: '拓也さんの料理教室【失敗編】', views: 32109, comments: 432, mylists: 88, likes: 765 },
      { id: 'sm43449876', title: '拓也さん名言集 2024年版', views: 21098, comments: 321, mylists: 66, likes: 654 },
      { id: 'sm43448765', title: '【歌ってみた】拓也さんが本気出してみた', views: 10987, comments: 210, mylists: 44, likes: 543 }
    ],
    'VOICEVOX': [
      { id: 'sm43445678', title: 'VOICEVOXずんだもんが歌う最新曲', views: 234567, comments: 3456, mylists: 678, likes: 4567 },
      { id: 'sm43444567', title: '【VOICEVOX劇場】四国めたんの大冒険', views: 198765, comments: 2987, mylists: 567, likes: 3876 },
      { id: 'sm43443456', title: 'VOICEVOX全キャラで〇〇してみた', views: 176543, comments: 2654, mylists: 498, likes: 3432 },
      { id: 'sm43442345', title: '【解説】VOICEVOXで作る感動ストーリー', views: 154321, comments: 2321, mylists: 432, likes: 3098 },
      { id: 'sm43441234', title: 'VOICEVOXカラオケ大会開催！', views: 132109, comments: 1987, mylists: 365, likes: 2765 },
      { id: 'sm43440123', title: '春日部つむぎが教える〇〇講座', views: 109876, comments: 1654, mylists: 298, likes: 2432 },
      { id: 'sm43439012', title: 'VOICEVOX×有名楽曲マッシュアップ', views: 87654, comments: 1321, mylists: 231, likes: 2098 },
      { id: 'sm43437901', title: '【VOICEVOX】波音リツの日常', views: 65432, comments: 987, mylists: 164, likes: 1765 },
      { id: 'sm43436890', title: 'VOICEVOXキャラで再現する名シーン', views: 43210, comments: 654, mylists: 97, likes: 1432 },
      { id: 'sm43435789', title: '雨晴はうが挑戦する早口言葉', views: 21098, comments: 321, mylists: 30, likes: 1098 }
    ]
  },
  '例のソレ': {
    'R-18': [
      { id: 'sm40031878', title: 'ミレイ 2', views: 4170, comments: 3, mylists: 12, likes: 89 },
      { id: 'sm43429876', title: '【R-18】紳士向け〇〇コレクション', views: 98765, comments: 234, mylists: 567, likes: 2345 },
      { id: 'sm43428765', title: '大人のための〇〇講座【R-18】', views: 87654, comments: 198, mylists: 498, likes: 2098 },
      { id: 'sm43427654', title: '【MMD】R-18ダンス集', views: 76543, comments: 176, mylists: 432, likes: 1876 },
      { id: 'sm43426543', title: '紳士の嗜み【R-18】', views: 65432, comments: 154, mylists: 365, likes: 1654 },
      { id: 'sm43425432', title: '【R-18】夜のお楽しみ動画', views: 54321, comments: 132, mylists: 298, likes: 1432 },
      { id: 'sm43424321', title: 'えっちなゲーム実況【R-18】', views: 43210, comments: 110, mylists: 231, likes: 1210 },
      { id: 'sm43423210', title: '【R-18】紳士向けASMR', views: 32109, comments: 88, mylists: 164, likes: 987 },
      { id: 'sm43422109', title: '大人の玩具レビュー【R-18】', views: 21098, comments: 66, mylists: 97, likes: 765 },
      { id: 'sm43421098', title: '【R-18】深夜の楽しみ方', views: 10987, comments: 44, mylists: 30, likes: 543 }
    ],
    '東方': [
      { id: 'sm43419876', title: '【東方】霊夢と魔理沙の〇〇対決', views: 234567, comments: 4567, mylists: 987, likes: 5678 },
      { id: 'sm43418765', title: '東方キャラで再現する有名シーン', views: 198765, comments: 3876, mylists: 876, likes: 4987 },
      { id: 'sm43417654', title: '【東方MMD】紅魔館の日常', views: 176543, comments: 3432, mylists: 765, likes: 4543 },
      { id: 'sm43416543', title: '東方アレンジメドレー2024', views: 154321, comments: 3098, mylists: 654, likes: 4109 },
      { id: 'sm43415432', title: '【ゆっくり実況】東方キャラで〇〇', views: 132109, comments: 2765, mylists: 543, likes: 3765 },
      { id: 'sm43414321', title: '東方手書き劇場 最新話', views: 109876, comments: 2432, mylists: 432, likes: 3432 },
      { id: 'sm43413210', title: '【東方】フランドールの大冒険', views: 87654, comments: 2098, mylists: 321, likes: 3098 },
      { id: 'sm43412109', title: '東方原曲ピアノアレンジ集', views: 65432, comments: 1765, mylists: 210, likes: 2765 },
      { id: 'sm43411098', title: '【東方MMD】咲夜さんの完璧な一日', views: 43210, comments: 1432, mylists: 99, likes: 2432 },
      { id: 'sm43410987', title: '東方キャラ人気投票結果発表！', views: 21098, comments: 1098, mylists: 10, likes: 2098 }
    ]
  }
}

function showRandomTagRankings() {
  // ランダムにタグを選択
  const otherTag = popularTags['その他'][Math.floor(Math.random() * popularTags['その他'].length)]!
  const reiSoreTag = popularTags['例のソレ'][Math.floor(Math.random() * popularTags['例のソレ'].length)]!

  console.log(`\n選択されたタグ:`)
  console.log(`その他: ${otherTag}`)
  console.log(`例のソレ: ${reiSoreTag}`)

  // その他ジャンルのサンプルデータを表示
  console.log(`\n=== その他ジャンル「${otherTag}」の上位10動画 ===`)
  const otherSample = sampleRankings['その他'][otherTag as keyof typeof sampleRankings['その他']] || sampleRankings['その他']['拓也さん']
  otherSample.forEach((item, index) => {
    console.log(`${index + 1}. ${item.title}`)
    console.log(`   ID: ${item.id}`)
    console.log(`   再生数: ${item.views.toLocaleString()}`)
    console.log(`   コメント数: ${item.comments.toLocaleString()}`)
    console.log(`   マイリスト数: ${item.mylists.toLocaleString()}`)
    console.log(`   いいね数: ${item.likes.toLocaleString()}`)
    console.log('')
  })

  // 例のソレジャンルのサンプルデータを表示
  console.log(`\n=== 例のソレジャンル「${reiSoreTag}」の上位10動画 ===`)
  const reiSoreSample = sampleRankings['例のソレ'][reiSoreTag as keyof typeof sampleRankings['例のソレ']] || sampleRankings['例のソレ']['R-18']
  reiSoreSample.forEach((item, index) => {
    console.log(`${index + 1}. ${item.title}`)
    console.log(`   ID: ${item.id}`)
    console.log(`   再生数: ${item.views.toLocaleString()}`)
    console.log(`   コメント数: ${item.comments.toLocaleString()}`)
    console.log(`   マイリスト数: ${item.mylists.toLocaleString()}`)
    console.log(`   いいね数: ${item.likes.toLocaleString()}`)
    console.log('')
  })

  console.log('\n※ これはサンプルデータです。実際のデータを取得するには、日本のIPアドレスからアクセスするか、プロキシサーバーを設定する必要があります。')
}

showRandomTagRankings()