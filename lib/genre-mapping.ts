// ジャンルマッピング: UIのジャンルキー → ニコニコ動画のジャンルID

import { RankingGenre } from '../types/ranking-config'

export const GENRE_ID_MAP: Record<RankingGenre, string> = {
  all: 'all',
  game: '4eet3ca4',
  anime: 'zc49b03a',
  vocaloid: 'dshv5do5',
  vtuber: 'e2bi9pt8',
  entertainment: '8kjl94d9',
  radio: 'oxzi6bje',
  music: 'wq76qdin',
  sing: '1ya6bnqd',
  dance: '6yuf530c',
  play: '6r5jr8nd',
  lecture: 'v6wdx6p5',
  cooking: 'lq8d5918',
  travel: 'k1libcse',
  nature: '24aa8fkw',
  vehicle: '3d8zlls9',
  animal: 'ne72lua2',
  sports: '4w3p65pf',
  tech: 'n46kcz9u',
  society: 'lzicx0y6',
  mmd: 'p1acxuoz',
  other: 'ramuboyn',
  r18: 'd2um7mc4' // 例のソレ（使用しない）
}

// UIのジャンルキーからニコニコ動画のジャンルIDを取得
export function getGenreId(genreKey: RankingGenre): string {
  const id = GENRE_ID_MAP[genreKey]
  if (!id) {
    throw new Error(`Unknown genre key: ${genreKey}`)
  }
  return id
}

// ニコニコ動画のジャンルIDからUIのジャンルキーを取得（逆引き）
export function getGenreKey(genreId: string): RankingGenre | null {
  const entry = Object.entries(GENRE_ID_MAP).find(([_, id]) => id === genreId)
  return entry ? entry[0] as RankingGenre : null
}