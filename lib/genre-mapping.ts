// ジャンルマッピング定義
import type { RankingGenre } from '@/types/ranking-config'

// UIのジャンルキーとニコニコAPIのジャンルIDをマッピング
export const GENRE_ID_MAP: Record<RankingGenre, string> = {
  all: 'all',
  entertainment: 'n8vfxdbi',
  radio: 'oxzi6bje',
  music: 'rr5ucexc',
  sing: 'f37eq4d3',
  play: 'hvcrnqpj',
  dance: 'z4h8e9mj',
  vocaloid: 'zc49b03a',
  nicoindies: 'o8s2vc0m',
  animal: 'ne72lua2',
  cooking: '9gkuqw8q',
  nature: 'l4wy3zaw',
  travel: 'h67gzba0',
  sports: '4w3p65pf',
  society: 'yspx0gpo',
  technology: 'x0nfxivd',
  handcraft: 'x3nkg5o7',
  commentary: 'mfg9v9pa',
  anime: '4eet3ca4',
  game: 'ojnwtgrg',
  other: 'ramuboyn',
  r18: 'r18',
  original: 'v5h6eeiw'
}

// 逆引き用マップ（ジャンルIDからUIキーへ）
export const GENRE_ID_REVERSE_MAP: Record<string, RankingGenre> = Object.entries(GENRE_ID_MAP).reduce(
  (acc, [key, value]) => {
    acc[value] = key as RankingGenre
    return acc
  },
  {} as Record<string, RankingGenre>
)

// ジャンルの日本語ラベル
export const GENRE_LABELS: Record<RankingGenre, string> = {
  all: '総合',
  entertainment: 'エンタメ',
  radio: 'ラジオ',
  music: '音楽・サウンド',
  sing: '歌ってみた',
  play: '演奏してみた',
  dance: '踊ってみた',
  vocaloid: 'VOCALOID',
  nicoindies: 'ニコニコインディーズ',
  animal: '動物',
  cooking: '料理',
  nature: '自然',
  travel: '旅行・アウトドア',
  sports: 'スポーツ',
  society: '社会・政治・時事',
  technology: '科学・技術',
  handcraft: 'ニコニコ手芸部',
  commentary: '解説・講座',
  anime: 'アニメ',
  game: 'ゲーム',
  other: 'その他',
  r18: 'R-18',
  original: 'オリジナル'
}

// ジャンルIDが有効かチェック
export function isValidGenreId(genreId: string): boolean {
  return genreId in GENRE_ID_REVERSE_MAP
}

// UIキーからジャンルIDを取得
export function getGenreId(genre: RankingGenre): string {
  return GENRE_ID_MAP[genre] || genre
}

// ジャンルIDからUIキーを取得
export function getGenreKey(genreId: string): RankingGenre | undefined {
  return GENRE_ID_REVERSE_MAP[genreId]
}