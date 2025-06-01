// 各ジャンルの人気タグ
// 動的取得が失敗した場合のフォールバック用
// 最新のデータはgetPopularTags関数で取得すること

import { kv } from '@vercel/kv'
import { fetchRanking } from './complete-hybrid-scraper'
import { GENRE_ID_MAP } from './genre-mapping'
import type { RankingGenre } from '../types/ranking-config'

// KVキャッシュのキープレフィックス
const POPULAR_TAGS_KEY_PREFIX = 'popular-tags:'
const POPULAR_TAGS_TTL = 3600 // 1時間

// ジャンルの人気タグを取得（キャッシュ付き）
export async function getPopularTags(genre: RankingGenre): Promise<string[]> {
  const cacheKey = `${POPULAR_TAGS_KEY_PREFIX}${genre}`
  
  try {
    // 1. まずGitHub Actionsが保存したランキングデータから取得
    if (typeof kv !== 'undefined') {
      const rankingKey = `ranking-${genre}`
      const rankingData = await kv.get<{
        items: any[]
        popularTags: string[]
        updatedAt: string
      }>(rankingKey)
      
      if (rankingData && rankingData.popularTags && rankingData.popularTags.length > 0) {
        // 取得できたら返す
        return rankingData.popularTags
      }
    }
  } catch (error) {
    console.error('Failed to get popular tags from ranking data:', error)
  }
  
  try {
    // 2. KVキャッシュから取得を試みる
    if (typeof kv !== 'undefined') {
      const cached = await kv.get<string[]>(cacheKey)
      if (cached && Array.isArray(cached)) {
        return cached
      }
    }
  } catch (error) {
    console.error('Failed to get popular tags from cache:', error)
  }
  
  try {
    // 3. 動的に人気タグを取得（フォールバック）
    const data = await fetchRanking(genre, null, '24h')
    
    if (data.popularTags && data.popularTags.length > 0) {
      // KVにキャッシュ
      if (typeof kv !== 'undefined') {
        try {
          await kv.set(cacheKey, data.popularTags, { ex: POPULAR_TAGS_TTL })
        } catch (error) {
          console.error('Failed to cache popular tags:', error)
        }
      }
      
      return data.popularTags
    }
  } catch (error) {
    console.error('Failed to fetch popular tags dynamically:', error)
  }
  
  // 4. 最終フォールバック：ハードコードされたタグを返す
  return FALLBACK_POPULAR_TAGS[genre] || []
}

// フォールバック用の人気タグ
// 動的取得が失敗した場合に使用（2025年1月の実データに基づく）
const FALLBACK_POPULAR_TAGS: Record<string, string[]> = {
  all: [
    'エンターテイメント',
    '音楽',
    'ゲーム',
    'アニメ',
    '例のアレ',
    'VOCALOID',
    '歌ってみた',
    'VOICEROID',
    'MMD',
    '東方',
  ],
  
  game: [
    'エルデンリング',
    '東方',
    '鳴花ヒメ・ミコト実況プレイ',
    '夏色花梨実況プレイ',
    '東北イタコ実況プレイ',
    'フリーゲーム',
    'VOICEROID実況プレイPart1リンク',
    'voicepeak実況プレイ',
    '宮舞モカ',
    'ドラゴンクエスト3',
    'ニンテンドースイッチ',
    'ポケモンsv対戦リンク',
    '自作立ち絵',
    'ゆっくりTRPG',
    'ファイアーエムブレム',
  ],
  
  anime: [
    'ブロリー',
    '例のアレ',
    '機動戦士ガンダム_水星の魔女',
    '作業用BGM',
    'アニメ',
    '音MAD',
    'MAD',
    '神回',
    'アニメOP',
  ],
  
  vocaloid: [
    'v_flower',
    '鏡音リン・レン',
    'リンオリジナル曲',
    'KAITO',
    'MEIKO',
    '巡音ルカ',
    '重音テトSV',
    'CeVIOカバー曲',
    '歌うボイスロイド',
    'ボカロV系カバー祭2025夏',
    'vocaloid',
    '歌踊コレok',
    '初音ミク',
    '重音テト',
    'GUMI',
  ],
  
  voicesynthesis: [
    '中国うさぎ',
    'ニコニコ国内旅行',
    '東北ずん子',
    'VOICEROID旅行',
    '鳴花ヒメ・ミコト実況プレイ',
    '夏色花梨実況プレイ',
    'VOICEPEAK実況プレイ',
    '四国めたん',
    '東北イタコ実況プレイ',
    'voiceroid',
    '小春六花',
    'voiceroid劇場',
    'CeVIO_AI',
    'VOICEROID実況プレイPart1リンク',
    '花隈千冬実況プレイ',
  ],
  
  vtuber: [
    '戌神ころね',
    '個人vtuber',
    'バーチャルYouTuber',
    'ホロライブ',
    'にじさんじ',
    'バーチャル',
    '歌ってみた',
  ],
  
  entertainment: [
    'アニメ',
    '紲星あかり',
    'アイドルマスター_シンデレラガールズ',
    '音楽',
    '合作',
    'エンターテイメント',
    '音MAD',
    '描いてみた',
    'アイドルマスター',
    '東方',
    'ずんだもん',
  ],
  
  radio: [
    '麻倉もも',
    'ラジオ',
    '声優',
    '男性声優',
    '文化放送',
    'ラジオドラマ',
    'ボイロラジオ',
    'アニメ',
  ],
  
  music: [
    'ニコニコメドレーシリーズ',
    'NNIオリジナル曲',
    '音楽',
    'ニコニコインディーズ',
    '作業用BGM',
    'ゲーム音楽',
    'アニメ',
  ],
  
  sing: [
    'アニソンを歌ってみた',
    '歌ってみた',
    'ボカロオリジナルを歌ってみた',
    '合唱シリーズ',
  ],
  
  dance: [
    '踊ってみた',
    'ダンス',
    'オリジナル振付',
  ],
  
  play: [
    '演奏してみた',
    'ピアノ',
    'ギター',
    '東方',
    'ゲーム音楽',
    '叩いてみた',
  ],
  
  commentary: [
    '機動戦士ガンダム',
    '琴葉葵',
    '四国めたん',
    'ニコニコ動画講座',
    'VOICEROID解説',
    'ゆっくり解説',
    'VOICEVOX解説',
    '歴史',
    '科学',
    'SCP解説',
    'ずんだもん',
    '結月ゆかり',
  ],
  
  cooking: [
    '飯テロ',
    '四国めたん',
    '料理',
    'VOICEROIDキッチン',
    'ニコニコ料理部',
    'ソフトウェアトークキッチン',
    'VOICEROID劇場',
    'VOICEROIDグルメ',
  ],
  
  travel: [
    '旅行',
    'ニコニコ国内旅行',
    'VOICEROID旅行',
    'VOICEVOX',
    'ソフトウェアトーク旅行',
  ],
  
  nature: [
    '自然',
    '魚釣り',
    'アウトドア',
    'VOICEROIDフィッシング',
    'ニコニコ農林部',
    '料理',
  ],
  
  vehicle: [
    '車載動画',
    'ドライブレコーダー',
    '交通事故',
    '世界の交通事情',
    '衝撃映像',
    '鉄道',
    'VOICEROID車載',
    '日本の交通事情',
    'ソフトウェアトーク車載',
  ],
  
  animal: [
    'VOICEROID',
    '動物',
    'AV(アニマルビデオ)',
    '猫',
    '犬',
  ],
  
  sports: [
    'スポーツ',
    '競馬',
    'サッカー',
    'プロ野球',
    '野球',
    'モータースポーツ',
  ],
  
  technology: [
    '作ってみた',
    'ニコニコ技術部',
    'プラモデル',
    'ニコニコ手芸部',
    'ミニ四駆',
    'ニコニコ兵器開発局',
  ],
  
  society: [
    '政治',
    'ニュース',
    '解説・講座',
    '歴史',
    '軍事',
    '経済',
  ],
  
  mmd: [
    'MMDドラマ',
    'MMDモーショントレース',
    'AxisPowersヘタリア',
    'MMD',
    'MMD艦これ',
    '東方MMD',
    'MMD刀剣乱舞',
    'MMDツイステ',
  ],
  
  other: [
    '四国めたん',
    '拓也さん',
    '変態糞親父',
    'AIのべりすと',
    'ブルアカ淫夢',
    'クッキー☆音MADリンク',
    'ボイロ淫夢',
    'インタビューシリーズ',
    '虐待おじさん',
    'kodax兄貴リスペクト',
    'BB先輩シリーズ',
    'BB素材',
    '関西クレーマー',
    '例のアレ',
    '真夏の夜の淫夢',
  ],
}

// 後方互換性のため、POPULAR_TAGSをエクスポート（非推奨）
export const POPULAR_TAGS = FALLBACK_POPULAR_TAGS