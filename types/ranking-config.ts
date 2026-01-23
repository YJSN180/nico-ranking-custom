// ランキングの設定に関する型定義

export type RankingPeriod = 'hour' | '24h'

export type RankingGenre = 
  | 'all'
  | 'game'
  | 'anime'
  | 'vocaloid'
  | 'voicesynthesis'
  | 'entertainment'
  | 'music'
  | 'sing'
  | 'dance'
  | 'play'
  | 'commentary'
  | 'cooking'
  | 'travel'
  | 'nature'
  | 'vehicle'
  | 'technology'
  | 'society'
  | 'mmd'
  | 'vtuber'
  | 'radio'
  | 'sports'
  | 'animal'
  | 'other'
  | 'custom'

export const GENRE_LABELS: Record<RankingGenre, string> = {
  all: '総合',
  game: 'ゲーム',
  anime: 'アニメ',
  vocaloid: 'ボカロ',
  voicesynthesis: '音声合成実況・解説・劇場',
  entertainment: 'エンタメ',
  music: '音楽',
  sing: '歌ってみた',
  dance: '踊ってみた',
  play: '演奏してみた',
  commentary: '解説・講座',
  cooking: '料理',
  travel: '旅行・アウトドア',
  nature: '自然',
  vehicle: '乗り物',
  technology: '技術・工作',
  society: '社会・政治・時事',
  mmd: 'MMD',
  vtuber: 'VTuber',
  radio: 'ラジオ',
  sports: 'スポーツ',
  animal: '動物',
  other: 'その他',
  custom: 'カスタム'
}

export const PERIOD_LABELS: Record<RankingPeriod, string> = {
  hour: '毎時',
  '24h': '24時間'
}

// 事前キャッシュされるジャンル（cron jobで実際に使用）
export const CACHED_GENRES: RankingGenre[] = [
  'all',
  'game',
  'entertainment',
  'other',
  'technology',
  'anime',
  'voicesynthesis'
]

export interface RankingConfig {
  period: RankingPeriod
  genre: RankingGenre
  tag?: string // 選択されたタグ（オプション）
}

// すべてのジャンルの配列（SEO用）
export const RANKING_GENRES: Array<{ value: RankingGenre; label: string }> = Object.entries(GENRE_LABELS).map(([value, label]) => ({
  value: value as RankingGenre,
  label
}))

// Genre groups for 6-key KV splitting (getthumbinfo APIレート制限対策)
// 各グループを小さくすることで、10分間隔で処理しても1200 req/時を超えない
export const GENRE_GROUPS = {
  1: ['all', 'game', 'anime', 'vocaloid'] as RankingGenre[],
  2: ['voicesynthesis', 'entertainment', 'music', 'sing'] as RankingGenre[],
  3: ['dance', 'play', 'commentary', 'cooking'] as RankingGenre[],
  4: ['travel', 'nature', 'vehicle', 'technology'] as RankingGenre[],
  5: ['society', 'mmd', 'vtuber', 'radio'] as RankingGenre[],
  6: ['sports', 'animal', 'other', 'custom'] as RankingGenre[]
} as const

// Helper function to get group ID for a genre
export function getGroupIdForGenre(genre: RankingGenre): 1 | 2 | 3 | 4 | 5 | 6 {
  for (const [groupId, genres] of Object.entries(GENRE_GROUPS)) {
    if (genres.includes(genre)) {
      return parseInt(groupId) as 1 | 2 | 3 | 4 | 5 | 6
    }
  }
  // Default to group 6 if not found
  return 6
}