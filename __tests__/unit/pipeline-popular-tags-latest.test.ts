// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildPopularTagsLatest,
  POPULAR_TAGS_ALL_SOURCE_GENRES,
  POPULAR_TAGS_LATEST_KEY,
} from '../../lib/pipeline/popular-tags-latest'

const period = (popularTags: unknown) => ({ items: [], popularTags, tags: {} })

describe('buildPopularTagsLatest', () => {
  it('ジャンルごとの人気タグを期間別に抜き出し、総合は採点して並べる', () => {
    const genres = {
      game: { '24h': period(['a', 'b', 'c']), hour: period(['h1']) },
      anime: { '24h': period(['b', 'd']), hour: period([]) },
      other: { '24h': period(['c']), hour: period(['h2', 'h1']) },
      // 総合の集計元ではないジャンル
      sing: { '24h': period(['歌']), hour: period(['歌']) },
    }
    const latest = buildPopularTagsLatest(genres, '2026-09-21T00:20:00.000Z')
    expect(latest.updatedAt).toBe('2026-09-21T00:20:00.000Z')
    expect(latest.genres.game).toEqual({ '24h': ['a', 'b', 'c'], hour: ['h1'] })
    expect(latest.genres.sing).toEqual({ '24h': ['歌'], hour: ['歌'] })
    // 24h: a=3, b=2+2, c=1+1, d=1（sing の「歌」は含まない）
    expect(latest.all['24h']).toEqual(['b', 'a', 'c', 'd'])
    // hour: h1=1+1, h2=2 の同点は出現順
    expect(latest.all.hour).toEqual(['h1', 'h2'])
  })

  it('壊れた形は空配列として扱い、文字列でないタグは落とす', () => {
    const latest = buildPopularTagsLatest(
      { game: { '24h': period(['a', 1, null]), hour: null }, anime: 'broken', vocaloid: { '24h': {} } },
      't',
    )
    expect(latest.genres.game).toEqual({ '24h': ['a'], hour: [] })
    expect(latest.genres.anime).toEqual({ '24h': [], hour: [] })
    expect(latest.genres.vocaloid).toEqual({ '24h': [], hour: [] })
    expect(latest.all).toEqual({ '24h': ['a'], hour: [] })
  })

  it('総合は上位 15 件に切り詰める', () => {
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`)
    const latest = buildPopularTagsLatest({ game: { '24h': period(many), hour: period([]) } }, 't')
    expect(latest.all['24h']).toEqual(many.slice(0, 15))
    expect(latest.all.hour).toEqual([])
  })

  it('キー名と総合の集計元ジャンルは読み手（lib/popular-tags.ts）と同じ', () => {
    expect(POPULAR_TAGS_LATEST_KEY).toBe('POPULAR_TAGS_LATEST')
    expect([...POPULAR_TAGS_ALL_SOURCE_GENRES]).toEqual(['game', 'anime', 'entertainment', 'technology', 'voicesynthesis', 'other'])
  })
})
