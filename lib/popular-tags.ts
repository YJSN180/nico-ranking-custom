// 各ジャンルの人気タグ
// 動的取得が失敗した場合のフォールバック用
// 最新のデータはgetPopularTags関数で取得すること

import { kv } from '@vercel/kv'
import { fetchRanking } from './complete-hybrid-scraper'
import { getGenreId } from './genre-mapping'
import type { RankingGenre } from '../types/ranking-config'

// KVキャッシュのキープレフィックス
const POPULAR_TAGS_KEY_PREFIX = 'popular-tags:'
const POPULAR_TAGS_TTL = 3600 // 1時間

// ジャンルの人気タグを取得（キャッシュ付き）
export async function getPopularTags(genre: RankingGenre): Promise<string[]> {
  const cacheKey = `${POPULAR_TAGS_KEY_PREFIX}${genre}`
  
  try {
    // KVキャッシュから取得を試みる
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
    // 動的に人気タグを取得
    const genreId = getGenreId(genre)
    const data = await fetchRanking(genreId, null, '24h')
    
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
  
  // フォールバック：ハードコードされたタグを返す
  return FALLBACK_POPULAR_TAGS[genre] || []
}

// フォールバック用の人気タグ
// 動的取得が失敗した場合に使用
const FALLBACK_POPULAR_TAGS: Record<string, string[]> = {
  all: [
    'エンターテイメント',
    '音楽',
    'ゲーム',
    'アニメ',
    '例のアレ',
  ],
  
  game: [
    'ゲーム',
    '実況プレイ動画',
    'RTA',
    'biim兄貴リスペクト',
    'ゆっくり実況',
    'VOICEROID実況',
    'Minecraft',
    'Steam',
  ],
  
  anime: [
    'アニメ',
    'MAD',
    'MAD動画',
    'AMV',
    'アニメOP',
    '手描き',
    'MMD',
    '東方',
  ],
  
  vocaloid: [
    'VOCALOID',
    '初音ミク',
    'ボカロ',
    'ボカロオリジナル',
    'ミクオリジナル曲',
    'UTAU',
    'CeVIO',
    'ボーカロイド',
  ],
  
  vtuber: [
    'バーチャルYouTuber',
    'VTuber',
    'にじさんじ',
    'ホロライブ',
    '個人VTuber',
    'VOICEROID実況',
    'ゆっくり実況',
    'VOICEVOX',
  ],
  
  entertainment: [
    'エンターテイメント',
    'バラエティ',
    'お笑い',
    '例のアレ',
    'ネタ動画',
    'MAD',
    'BB先輩シリーズ',
    '虐待おじさん',
  ],
  
  radio: [
    'ラジオ',
    '声優',
    '男性声優',
    '文化放送',
    'ラジオドラマ',
    'ボイロラジオ',
    'アニメ',
  ],
  
  music: [
    '音楽',
    'MV',
    'ミュージックビデオ',
    '作業用BGM',
    'インスト',
    'オリジナル曲',
    'カバー',
    'BGM',
  ],
  
  sing: [
    '歌ってみた',
    '歌い手',
    'カバー',
    '弾き語り',
    'アカペラ',
    'ボカロオリジナルを歌ってみた',
    '男性ボーカル',
    '女性ボーカル',
  ],
  
  dance: [
    '踊ってみた',
    'ダンス',
    'オリジナル振付',
    'コスプレで踊ってみた',
    'MMD',
    'オドリドリ',
    'K-POP',
    'アイドル',
  ],
  
  play: [
    '演奏してみた',
    'ピアノ',
    'ギター',
    'ドラム',
    'ベース',
    '弾いてみた',
    'DTM',
    'カバー',
  ],
  
  lecture: [
    '解説',
    '講座',
    'ゆっくり解説',
    'VOICEROID解説',
    '歴史',
    '科学',
    '勉強',
    'ニコニコ動画講座',
  ],
  
  cooking: [
    '料理',
    'クッキング',
    'レシピ',
    '作ってみた',
    'お菓子作り',
    'ニコニコ料理部',
    '飯テロ',
    'キャンプ飯',
  ],
  
  travel: [
    '旅行',
    'アウトドア',
    'キャンプ',
    '車載動画',
    '登山',
    'ツーリング',
    '鉄道',
    'ドライブ',
  ],
  
  nature: [
    '自然',
    '風景',
    '癒し',
    '環境音',
    '季節',
    '花',
    '天体',
    '空',
  ],
  
  vehicle: [
    '乗り物',
    '車',
    'バイク',
    '鉄道',
    '飛行機',
    '車載動画',
    'ドライブ',
    'レース',
  ],
  
  animal: [
    '動物',
    'AV(アニマルビデオ)',
    '猫',
    '犬',
    'ペット',
    'ぬこぬこ動画',
    '野生動物',
    'インコ',
  ],
  
  sports: [
    'スポーツ',
    '競馬',
    'サッカー',
    'プロ野球',
    '野球',
    'モータースポーツ',
    'F1',
    '格闘技',
  ],
  
  tech: [
    '技術',
    '工作',
    '電子工作',
    'プログラミング',
    '3Dプリンタ',
    'ニコニコ技術部',
    '作ってみた',
    'Unity',
  ],
  
  society: [
    '社会',
    '政治',
    '時事',
    'ニュース',
    '経済',
    '歴史',
    'ドキュメンタリー',
    '解説',
  ],
  
  mmd: [
    'MMD',
    'MikuMikuDance',
    'MMDモデル',
    'MMDモーション',
    'MMDドラマ',
    'MMD艦これ',
    'MMD刀剣乱舞',
    'PMXEditor',
  ],
  
  other: [
    'その他',
    'VLOG',
    '日記',
    'レビュー',
    'ペット',
    '例のアレ',
    'BB先輩シリーズ',
    '虐待おじさん',
  ],
}

// 後方互換性のため、POPULAR_TAGSをエクスポート（非推奨）
export const POPULAR_TAGS = FALLBACK_POPULAR_TAGS