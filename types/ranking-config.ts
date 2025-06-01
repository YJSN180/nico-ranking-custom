// ランキングの設定に関する型定義

export type RankingPeriod = 'hour' | '24h'

export type RankingGenre = 
  | 'all'
  | 'entertainment'
  | 'radio'
  | 'music'
  | 'sing'
  | 'play'
  | 'dance'
  | 'vocaloid'
  | 'nicoindies'
  | 'animal'
  | 'cooking'
  | 'nature'
  | 'travel'
  | 'sports'
  | 'society'
  | 'technology'
  | 'handcraft'
  | 'commentary'
  | 'anime'
  | 'game'
  | 'other'
  | 'r18'
  | 'original'

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

export const PERIOD_LABELS: Record<RankingPeriod, string> = {
  hour: '毎時',
  '24h': '24時間'
}

export interface RankingConfig {
  period: RankingPeriod
  genre: RankingGenre
  tag?: string // 選択されたタグ（オプション）
}