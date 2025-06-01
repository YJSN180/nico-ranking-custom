#!/usr/bin/env tsx

// 全23ジャンルの人気タグを調査

import { GENRES } from '../lib/complete-hybrid-scraper'
import { GENRE_ID_MAP } from '../lib/genre-mapping'

async function analyzeAllGenresTags() {
  console.log('=== 全23ジャンルの人気タグ調査 ===\n')
  
  // 動画タイトルから推測される各ジャンルの人気タグ
  const genreSuggestedTags: Record<string, string[]> = {
    radio: [
      'ラジオ', '声優', 'アニラジ', 'ゲームラジオ', 'Webラジオ',
      '公式ラジオ', 'ニコラジ', 'ラジオ番組', 'トークラジオ', 'ラジオドラマ',
      'DGS', '裏談話室', '初動祭ラジオ', '会員限定', '会員専用'
    ],
    animal: [
      '動物', '猫', 'ネコ', 'ぬこ', '犬', 'イヌ', 'わんこ',
      'ペット', '野良猫', '保護猫', '子猫', 'ハムスター', 'うさぎ',
      '鳥', 'インコ', '爬虫類', '水族館', '動物園', 'かわいい動物'
    ],
    sports: [
      'スポーツ', '野球', 'サッカー', 'バスケ', 'テニス', 'ゴルフ',
      '格闘技', 'プロレス', '競馬', '競輪', '競艇', 'オートレース',
      'モータースポーツ', 'F1', 'オリンピック', 'ワールドカップ',
      '高校野球', 'プロ野球', 'Jリーグ', 'NBA'
    ]
  }

  // 他のジャンルの既知の人気タグ（popular-tags.tsから）
  const knownPopularTags: Record<string, string[]> = {
    all: ['エンターテイメント', '音楽', 'ゲーム', 'アニメ', '例のアレ'],
    game: ['ゲーム', '実況プレイ動画', 'RTA', 'biim兄貴リスペクト', 'ゆっくり実況'],
    anime: ['アニメ', 'MAD', 'MAD動画', 'AMV', 'アニメOP'],
    vocaloid: ['VOCALOID', '初音ミク', 'ボカロ', 'ボカロオリジナル', 'ミクオリジナル曲'],
    vtuber: ['バーチャルYouTuber', 'VTuber', 'にじさんじ', 'ホロライブ', '個人VTuber'],
    entertainment: ['エンターテイメント', 'バラエティ', 'お笑い', '例のアレ', 'ネタ動画'],
    music: ['音楽', 'MV', 'ミュージックビデオ', '作業用BGM', 'インスト'],
    sing: ['歌ってみた', '歌い手', 'カバー', '弾き語り', 'アカペラ'],
    dance: ['踊ってみた', 'ダンス', 'オリジナル振付', 'コスプレで踊ってみた', 'MMD'],
    play: ['演奏してみた', 'ピアノ', 'ギター', 'ドラム', 'ベース'],
    lecture: ['解説', '講座', 'ゆっくり解説', 'VOICEROID解説', '歴史'],
    cooking: ['料理', 'クッキング', 'レシピ', '作ってみた', 'お菓子作り'],
    travel: ['旅行', 'アウトドア', 'キャンプ', '車載動画', '登山'],
    nature: ['自然', '風景', '癒し', '環境音', '季節'],
    vehicle: ['乗り物', '車', 'バイク', '鉄道', '飛行機'],
    tech: ['技術', '工作', '電子工作', 'プログラミング', '3Dプリンタ'],
    society: ['社会', '政治', '時事', 'ニュース', '経済'],
    mmd: ['MMD', 'MikuMikuDance', 'MMDモデル', 'MMDモーション', 'MMDドラマ'],
    other: ['その他', 'VLOG', '日記', 'レビュー', 'ペット']
  }

  // 全ジャンルを処理
  for (const [key, genre] of Object.entries(GENRES)) {
    console.log(`\n=== ${genre.label} (${key}) ===`)
    console.log(`ジャンルID: ${genre.id}`)
    
    // 既知の人気タグがある場合
    if (knownPopularTags[key]) {
      console.log('既知の人気タグ:')
      knownPopularTags[key].forEach((tag, idx) => {
        console.log(`  ${idx + 1}. ${tag}`)
      })
    }
    
    // 新ジャンルの推測タグ
    if (genreSuggestedTags[key]) {
      console.log('推測される人気タグ:')
      genreSuggestedTags[key].forEach((tag, idx) => {
        console.log(`  ${idx + 1}. ${tag}`)
      })
    }
    
    // 既知でも推測でもない場合
    if (!knownPopularTags[key] && !genreSuggestedTags[key]) {
      console.log('人気タグ情報なし')
    }
  }
  
  console.log('\n\n=== サマリー ===')
  console.log(`総ジャンル数: ${Object.keys(GENRES).length}`)
  console.log(`既知の人気タグがあるジャンル: ${Object.keys(knownPopularTags).length}`)
  console.log(`新規追加ジャンル: ラジオ、動物、スポーツ`)
}

// 実行
analyzeAllGenresTags().catch(console.error)