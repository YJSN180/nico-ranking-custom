// ランキングの設定に関する型定義

export type RankingPeriod = 'hour' | '24h'

export type RankingGenre = 
  | 'all'
  | 'game'
  | 'anime'
  | 'vocaloid'
  | 'vtuber'
  | 'entertainment'
  | 'radio'
  | 'music'
  | 'sing'
  | 'dance'
  | 'play'
  | 'lecture'
  | 'cooking'
  | 'travel'
  | 'nature'
  | 'vehicle'
  | 'animal'
  | 'sports'
  | 'tech'
  | 'society'
  | 'mmd'
  | 'other'
  | 'r18' // 例のソレ

export const GENRE_LABELS: Record<RankingGenre, string> = {
  all: '総合',
  game: 'ゲーム',
  anime: 'アニメ',
  vocaloid: 'ボカロ',
  vtuber: '音声合成実況・解説・劇場',
  entertainment: 'エンタメ',
  radio: 'ラジオ',
  music: '音楽',
  sing: '歌ってみた',
  dance: '踊ってみた',
  play: '演奏してみた',
  lecture: '解説・講座',
  cooking: '料理',
  travel: '旅行・アウトドア',
  nature: '自然',
  vehicle: '乗り物',
  animal: '動物',
  sports: 'スポーツ',
  tech: '技術・工作',
  society: '社会・政治・時事',
  mmd: 'MMD',
  other: 'その他',
  r18: '例のソレ'
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