// ランキングの設定に関する型定義

export type RankingPeriod = 'hour' | '24h'

export type RankingGenre = 
  | 'all'
  | 'entertainment' 
  | 'radio'
  | 'music_sound'
  | 'dance'
  | 'anime'
  | 'game'
  | 'animal'
  | 'cooking'
  | 'nature'
  | 'sports'
  | 'society_politics_news'
  | 'technology_craft'
  | 'other'
  | 'r18'
  | 'd2um7mc4' // 例のソレ

export const GENRE_LABELS: Record<RankingGenre, string> = {
  all: '総合',
  entertainment: 'エンターテイメント',
  radio: 'ラジオ',
  music_sound: '音楽・サウンド',
  dance: 'ダンス',
  anime: 'アニメ',
  game: 'ゲーム',
  animal: '動物',
  cooking: '料理',
  nature: '自然',
  sports: 'スポーツ',
  society_politics_news: '社会・政治・時事',
  technology_craft: '技術・工作',
  other: 'その他',
  r18: 'R-18',
  d2um7mc4: '例のソレ'
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