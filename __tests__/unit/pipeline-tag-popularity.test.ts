// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
vi.mock('../../scripts/lib/r2-store', () => ({
  createR2Store: () => ({ read: vi.fn() }),
}))
import {
  POPULARITY_BASE_LOG2,
  POPULARITY_HALF_LIFE_HOURS,
  POPULARITY_STEPS_PER_DOUBLING,
  addPeriodTags,
  buildTagAccumulation,
  countTagVideos,
  createRunTags,
  decodePopularity,
  levelToPopularity,
  mergeTagAccumulation,
  popularityToLevel,
  serializeTagAccumulation,
  toEpochDay,
  type MergedTagAccumulation,
  type TagPopularityLevels,
} from '../../scripts/accumulate-tags'
import {
  TAG_POPULARITY_MAX_LEVEL,
  encodeTagPopularity,
} from '../../workers/utils/tag-suggest'

const NOW = new Date('2026-10-03T12:00:00Z')
const TODAY = toEpochDay(NOW)
const HOUR = 3_600_000
const HALF_STEP = 2 ** (0.5 / POPULARITY_STEPS_PER_DOUBLING) - 1
const retentionAfter = (ms: number): number =>
  2 ** (-ms / (POPULARITY_HALF_LIFE_HOURS * HOUR))
// 辞書の並び順（localeCompare）
const japaneseOrder = (a: string, b: string): number =>
  a.localeCompare(b, 'ja', { numeric: true, caseFirst: 'lower' })

interface MergeInput {
  tags: string[]
  lastSeenDays: number[]
  popularity?: TagPopularityLevels
}

function scores(result: {
  tags: string[]
  popularity: { base: number; levels: ArrayLike<number> }
}): Map<string, number> {
  return new Map(
    result.tags.map((tag, i) => [
      tag,
      levelToPopularity(result.popularity.levels[i], result.popularity.base),
    ]),
  )
}

function levels(result: MergedTagAccumulation): Map<string, number> {
  return new Map(
    result.tags.map((tag, i) => [tag, result.popularity.levels[i]]),
  )
}

/** 前回の結果を次の保存の既存データにする */
function carry(result: MergedTagAccumulation): MergeInput {
  return {
    tags: result.tags,
    lastSeenDays: result.lastSeenDays,
    popularity: result.popularity,
  }
}

function expectClose(
  actual: number | undefined,
  expected: number,
  relative: number,
): void {
  expect(actual).toBeDefined()
  expect(Math.abs((actual ?? Number.NaN) / expected - 1)).toBeLessThanOrEqual(
    relative,
  )
}

describe('counting videos per tag', () => {
  it('counts each video once across genres, periods and tag rankings', () => {
    const run = createRunTags()
    // ジャンル A の 24 時間
    addPeriodTags(run, {
      items: [
        { id: 'sm1', tags: ['ゲーム', '実況'] },
        {
          id: 'sm2',
          tags: ['ゲーム'],
          tagDetails: [
            { name: 'ゲーム', isLocked: true },
            { name: 'RTA', isLocked: false },
          ],
        },
      ],
      popularTags: ['人気'],
      tags: {
        ゲーム: [
          { id: 'sm1', tags: ['ゲーム', '実況', 'ランキングだけ'] },
          { id: 'sm3', tags: ['ゲーム'] },
        ],
      },
    })
    // ジャンル B の 1 時間（同じ動画が別のタグの書き方で載る）
    addPeriodTags(run, {
      items: [{ id: 'sm1', tags: ['ゲーム', ' 実況 '] }],
      popularTags: [],
      tags: {},
    })

    expect(countTagVideos(run.videoTags)).toEqual(
      new Map([
        ['ゲーム', 3],
        ['実況', 1],
        ['RTA', 1],
        ['ランキングだけ', 1],
      ]),
    )
    // 辞書へ入れるタグは今までどおり（タグ別ランキングの動画のタグは入れない）
    expect(run.seen).toEqual(
      new Set(['ゲーム', '実況', 'RTA', '人気', ' 実況 ']),
    )
  })

  it('sees tags of videos without an id but does not count them, and skips malformed data', () => {
    const run = createRunTags()
    addPeriodTags(run, {
      items: [
        { tags: ['IDなし'] },
        { id: '', tags: ['空ID'] },
        null,
        'item',
        {
          id: 'sm9',
          tags: 'not-a-list',
          tagDetails: [null, { name: 3 }, { name: '詳細' }],
        },
        { id: 'sm10', tags: [1, null] },
      ],
      popularTags: [1, '人気'],
      tags: { 一覧なし: 'not-a-list' },
    })
    addPeriodTags(run, null)
    addPeriodTags(run, 'period')
    addPeriodTags(run, { items: 'not-a-list' })

    expect(countTagVideos(run.videoTags)).toEqual(new Map([['詳細', 1]]))
    expect(run.seen).toEqual(
      new Set(['IDなし', '空ID', '詳細', '人気', '一覧なし']),
    )
  })

  it('drops names that are empty or too long after trimming', () => {
    const counts = countTagVideos(
      new Map([
        ['sm1', new Set(['  ', 'x'.repeat(101), 'ok', ' ok'])],
        ['sm2', new Set(['ok'])],
      ]),
    )
    expect(counts).toEqual(new Map([['ok', 2]]))
  })
})

describe('popularity quantization', () => {
  it('round-trips every level for the reference base and a shifted base', () => {
    for (const base of [
      POPULARITY_BASE_LOG2,
      POPULARITY_BASE_LOG2 + 0.4 / POPULARITY_STEPS_PER_DOUBLING,
      POPULARITY_BASE_LOG2 - 0.5 / POPULARITY_STEPS_PER_DOUBLING,
    ]) {
      for (let level = 0; level <= TAG_POPULARITY_MAX_LEVEL; level++) {
        if (popularityToLevel(levelToPopularity(level, base), base) !== level) {
          throw new Error(`level ${level} does not round-trip at base ${base}`)
        }
      }
    }
  })

  it('keeps any representable score within half a step', () => {
    let seed = 1
    for (let i = 0; i < 20_000; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      // 1e-7〜1e5 を対数で一様に
      const score = 10 ** (-7 + (12 * seed) / 4294967296)
      const decoded = levelToPopularity(
        popularityToLevel(score, POPULARITY_BASE_LOG2),
        POPULARITY_BASE_LOG2,
      )
      expect(Math.abs(decoded / score - 1)).toBeLessThanOrEqual(
        HALF_STEP + 1e-12,
      )
    }
  })

  it('maps zero and tiny scores to 0 and clamps huge scores', () => {
    for (const score of [0, -1, Number.NaN, 2 ** -27]) {
      expect(popularityToLevel(score, POPULARITY_BASE_LOG2)).toBe(0)
    }
    expect(popularityToLevel(2 ** -26, POPULARITY_BASE_LOG2)).toBe(1)
    expect(popularityToLevel(1e9, POPULARITY_BASE_LOG2)).toBe(
      TAG_POPULARITY_MAX_LEVEL,
    )
    expect(
      popularityToLevel(Number.POSITIVE_INFINITY, POPULARITY_BASE_LOG2),
    ).toBe(TAG_POPULARITY_MAX_LEVEL)
    expect(levelToPopularity(0, POPULARITY_BASE_LOG2)).toBe(0)
  })
})

describe('popularity in mergeTagAccumulation', () => {
  const tags = ['a', 'b', 'c']
  const lastSeenDays = [TODAY, TODAY, TODAY]

  it('starts from this run counts when there is no previous save', () => {
    const result = mergeTagAccumulation(
      { tags, lastSeenDays },
      ['a', 'b'],
      TODAY,
      {
        videoCounts: new Map([
          ['a', 10],
          ['b', 3],
          ['未登録', 99],
        ]),
      },
    )
    const got = scores(result)
    expectClose(got.get('a'), 10, HALF_STEP)
    expectClose(got.get('b'), 3, HALF_STEP)
    expect(got.get('c')).toBe(0)
    // 辞書にないタグは数があっても足さない
    expect(result.tags).toEqual(['a', 'b', 'c'])
    expect(result.popularity.base).toBe(POPULARITY_BASE_LOG2)
    expect(result.stats).toMatchObject({ popularityCarried: false, scored: 2 })
  })

  it('treats a dictionary without popularity as all zero and weighs this run by the elapsed time', () => {
    const result = mergeTagAccumulation({ tags, lastSeenDays }, ['a'], TODAY, {
      videoCounts: new Map([['a', 10]]),
      elapsedMs: HOUR,
    })
    expectClose(
      scores(result).get('a'),
      10 * (1 - retentionAfter(HOUR)),
      HALF_STEP,
    )
    expect(scores(result).get('b')).toBe(0)
    expect(result.stats.popularityCarried).toBe(false)
  })

  it('halves a score that was not seen for one half-life, without rounding it again', () => {
    const first = mergeTagAccumulation({ tags, lastSeenDays }, tags, TODAY, {
      videoCounts: new Map([
        ['a', 37],
        ['b', 1],
      ]),
    })
    const later = mergeTagAccumulation(carry(first), ['c'], TODAY, {
      elapsedMs: POPULARITY_HALF_LIFE_HOURS * HOUR,
    })
    const before = scores(first)
    const after = scores(later)
    expectClose(after.get('a'), (before.get('a') ?? 0) / 2, 1e-12)
    expectClose(after.get('b'), (before.get('b') ?? 0) / 2, 1e-12)
    expect(later.stats.popularityCarried).toBe(true)
    // 1 日分（1024 段）だけずれ、base は基準の半段以内に戻る
    expect((levels(first).get('a') ?? 0) - (levels(later).get('a') ?? 0)).toBe(
      POPULARITY_STEPS_PER_DOUBLING,
    )
    expect(
      Math.abs(later.popularity.base - POPULARITY_BASE_LOG2),
    ).toBeLessThanOrEqual(0.5 / POPULARITY_STEPS_PER_DOUBLING)
  })

  it('keeps unseen scores exact over many irregular saves', () => {
    let result = mergeTagAccumulation({ tags, lastSeenDays }, tags, TODAY, {
      videoCounts: new Map([
        ['a', 123],
        ['b', 4],
        ['c', 1],
      ]),
    })
    const start = scores(result)
    let elapsed = 0
    for (let i = 0; i < 200; i++) {
      const step = (7 + ((i * 37) % 113)) * 60_000
      elapsed += step
      result = mergeTagAccumulation(carry(result), ['a'], TODAY, {
        elapsedMs: step,
      })
    }
    const factor = retentionAfter(elapsed)
    for (const tag of tags) {
      expectClose(scores(result).get(tag), (start.get(tag) ?? 0) * factor, 1e-9)
    }
  })

  it('does not change scores for a repeated run at the same time', () => {
    const first = mergeTagAccumulation({ tags, lastSeenDays }, tags, TODAY, {
      videoCounts: new Map([
        ['a', 10],
        ['b', 5],
      ]),
    })
    const repeated = mergeTagAccumulation(carry(first), tags, TODAY, {
      videoCounts: new Map([
        ['a', 10],
        ['b', 5],
        ['c', 50],
      ]),
      elapsedMs: 0,
    })
    expect(repeated.popularity.levels).toEqual(first.popularity.levels)
    // 時計のずれで前回が未来に見えても同じ
    const skewed = mergeTagAccumulation(carry(first), tags, TODAY, {
      videoCounts: new Map([['c', 50]]),
      elapsedMs: -5 * 60_000,
    })
    expect(skewed.popularity.levels).toEqual(first.popularity.levels)
  })

  it('gives the same score whether a gap is saved once or hour by hour', () => {
    const counts = new Map([
      ['a', 40],
      ['b', 2],
    ])
    const first = mergeTagAccumulation({ tags, lastSeenDays }, tags, TODAY, {
      videoCounts: new Map([
        ['a', 10],
        ['b', 20],
      ]),
    })
    const once = mergeTagAccumulation(carry(first), tags, TODAY, {
      videoCounts: counts,
      elapsedMs: 3 * HOUR,
    })
    let hourly = first
    for (let i = 0; i < 3; i++) {
      hourly = mergeTagAccumulation(carry(hourly), tags, TODAY, {
        videoCounts: counts,
        elapsedMs: HOUR,
      })
    }
    const d = retentionAfter(3 * HOUR)
    for (const [tag, start] of [
      ['a', 10],
      ['b', 20],
    ] as const) {
      const exact = start * d + (counts.get(tag) ?? 0) * (1 - d)
      expectClose(scores(once).get(tag), exact, 2 * HALF_STEP)
      expectClose(scores(hourly).get(tag), exact, 4 * HALF_STEP)
    }
  })

  it('stays within 1% of the exact average over 30 days of hourly saves', () => {
    const patterns: Record<string, (run: number) => number> = {
      steady: () => 10,
      large: () => 3000,
      sparse: (run) => (run % 6 === 0 ? 30 : 0),
      burst: (run) => (run < 48 ? 500 : 0),
      fading: (run) => (run < 48 ? 3000 : 1),
      cycle: (run) => Math.round(50 + 45 * Math.sin((2 * Math.PI * run) / 168)),
    }
    const names = Object.keys(patterns)
    let existing: MergeInput = {
      tags: names,
      lastSeenDays: names.map(() => TODAY),
    }
    const exact = new Map(names.map((name) => [name, 0]))
    const d = retentionAfter(HOUR)
    let worst = 0
    for (let run = 0; run < 24 * 30; run++) {
      const counts = new Map<string, number>()
      for (const name of names) {
        const count = patterns[name](run)
        counts.set(name, count)
        exact.set(
          name,
          run === 0 ? count : (exact.get(name) ?? 0) * d + count * (1 - d),
        )
      }
      const result = mergeTagAccumulation(existing, names, TODAY, {
        videoCounts: counts,
        elapsedMs: run === 0 ? null : HOUR,
      })
      existing = carry(result)
      for (const [name, score] of scores(result)) {
        worst = Math.max(worst, Math.abs(score / (exact.get(name) ?? 0) - 1))
      }
    }
    expect(worst).toBeLessThan(0.01)
  })

  it.each([
    ['a missing popularity', undefined as TagPopularityLevels | undefined],
    ['a shorter popularity', { base: POPULARITY_BASE_LOG2, levels: [5, 6] }],
    ['fractional levels', { base: POPULARITY_BASE_LOG2, levels: [5, 1.5, 6] }],
    ['negative levels', { base: POPULARITY_BASE_LOG2, levels: [5, -1, 6] }],
    [
      'levels above the range',
      {
        base: POPULARITY_BASE_LOG2,
        levels: [5, TAG_POPULARITY_MAX_LEVEL + 1, 6],
      },
    ],
    ['a non-finite base', { base: Number.NaN, levels: [5, 6, 7] }],
  ])('treats %s as zero without failing', (_label, popularity) => {
    const result = mergeTagAccumulation(
      { tags, lastSeenDays, popularity },
      ['a'],
      TODAY,
      { videoCounts: new Map([['a', 8]]), elapsedMs: HOUR },
    )
    expect(result.stats.popularityCarried).toBe(false)
    expect(result.popularity.base).toBe(POPULARITY_BASE_LOG2)
    expect(levels(result)).toEqual(
      new Map([
        [
          'a',
          popularityToLevel(
            8 * (1 - retentionAfter(HOUR)),
            POPULARITY_BASE_LOG2,
          ),
        ],
        ['b', 0],
        ['c', 0],
      ]),
    )
  })

  it('keeps popularity aligned through decoding, merging twins, the cap and sorting', () => {
    const result = mergeTagAccumulation(
      {
        tags: [
          'ゲーム&amp;ウオッチ',
          'ゲーム&ウオッチ',
          'ん',
          'い',
          'あ',
          'う',
        ],
        lastSeenDays: [
          TODAY - 9,
          TODAY - 1,
          TODAY - 2,
          TODAY - 3,
          TODAY - 4,
          TODAY - 40,
        ],
        popularity: {
          base: POPULARITY_BASE_LOG2,
          levels: [900, 300, 500, 400, 100, 700],
        },
      },
      ['え'],
      TODAY,
      {
        maxTags: 4,
        elapsedMs: 0,
        videoCounts: new Map([
          ['え', 2],
          ['い', 1],
        ]),
      },
    )
    // 'う' は保持期間切れ、'あ' は上限で落ちる。同じ名前になった 2 つは新しい日と高い人気度を残す
    expect(result.tags).toEqual(
      ['い', 'え', 'ん', 'ゲーム&ウオッチ'].sort(japaneseOrder),
    )
    expect(result.stats).toMatchObject({
      decoded: 1,
      expired: 1,
      capped: 1,
      popularityCarried: true,
    })
    // 経過 0 では前回の人気度はそのまま、今回の数も足さない
    expect(levels(result)).toEqual(
      new Map([
        ['ゲーム&ウオッチ', 900],
        ['ん', 500],
        ['い', 400],
        ['え', 0],
      ]),
    )
    expect(
      new Map(result.tags.map((tag, i) => [tag, result.lastSeenDays[i]])),
    ).toEqual(
      new Map([
        ['ゲーム&ウオッチ', TODAY - 1],
        ['ん', TODAY - 2],
        ['い', TODAY - 3],
        ['え', TODAY],
      ]),
    )
  })

  it('does not let popularity decide which tags the cap keeps', () => {
    const popular = mergeTagAccumulation(
      {
        tags: ['古いが人気', '新しい'],
        lastSeenDays: [TODAY - 5, TODAY - 1],
        popularity: {
          base: POPULARITY_BASE_LOG2,
          levels: [TAG_POPULARITY_MAX_LEVEL, 1],
        },
      },
      ['今回'],
      TODAY,
      { maxTags: 2, elapsedMs: HOUR },
    )
    expect(new Set(popular.tags)).toEqual(new Set(['今回', '新しい']))
  })
})

describe('popularity in buildTagAccumulation', () => {
  const base = {
    tags: ['あ', 'い', 'う'],
    lastSeenDays: [TODAY, TODAY, TODAY],
    metadata: { version: 3, weeklyUpdateCount: 3 },
  }

  function saved(result: {
    data: ReturnType<typeof buildTagAccumulation>['data']
  }) {
    const parsed = JSON.parse(serializeTagAccumulation(result.data)) as {
      tags: string[]
      popularity: unknown
      metadata: {
        version: number
        weeklyUpdateCount: number
        lastUpdated: string
        popularityVersion: unknown
      }
    }
    const popularity = decodePopularity(
      parsed.tags,
      parsed.popularity,
      parsed.metadata.popularityVersion,
    )
    expect(popularity).not.toBeNull()
    return {
      tags: parsed.tags,
      lastSeenDays: [TODAY, TODAY, TODAY],
      popularity: popularity ?? undefined,
      namesDecoded: true,
      metadata: parsed.metadata,
    }
  }

  it('writes the popularity format and carries it through JSON into the next save', () => {
    const first = buildTagAccumulation(
      base,
      ['あ'],
      NOW,
      'partial-results',
      new Map([
        ['あ', 12],
        ['い', 3],
      ]),
    )
    expect(first.data.metadata.popularityVersion).toBe(1)
    expect(first.data.popularity.scores).toHaveLength(9)
    expect(first.stats).toMatchObject({ popularityCarried: false, scored: 2 })
    const stored = saved(first)
    expect(Array.from(stored.popularity?.levels ?? [])).toEqual(
      [12, 3, 0].map((count) => popularityToLevel(count, POPULARITY_BASE_LOG2)),
    )

    // 前回の保存時刻から 1 日後: 見ていないタグは半分、今回の数はその残りの重みで足す
    const nextDay = new Date(NOW.getTime() + POPULARITY_HALF_LIFE_HOURS * HOUR)
    const second = buildTagAccumulation(
      stored,
      ['う'],
      nextDay,
      'partial-results',
      new Map([['う', 8]]),
    )
    expect(second.stats.popularityCarried).toBe(true)
    const got = scores({
      tags: second.data.tags,
      popularity: saved(second).popularity ?? { base: 0, levels: [] },
    })
    expectClose(got.get('あ'), 6, 2 * HALF_STEP)
    expectClose(got.get('い'), 1.5, 2 * HALF_STEP)
    expectClose(got.get('う'), 4, HALF_STEP)
  })

  it('ignores the previous popularity when the previous save time is unknown', () => {
    const first = saved(
      buildTagAccumulation(
        base,
        ['あ'],
        NOW,
        'partial-results',
        new Map([['あ', 12]]),
      ),
    )
    const metadata = {
      version: first.metadata.version,
      weeklyUpdateCount: first.metadata.weeklyUpdateCount,
    }
    const result = buildTagAccumulation(
      { ...first, metadata },
      ['い'],
      NOW,
      'partial-results',
      new Map([['い', 5]]),
    )
    expect(result.stats.popularityCarried).toBe(false)
    const got = scores({
      tags: result.data.tags,
      popularity: saved(result).popularity ?? { base: 0, levels: [] },
    })
    expect(got.get('あ')).toBe(0)
    expectClose(got.get('い'), 5, HALF_STEP)
  })

  it('adds nothing for a run saved again at the same time', () => {
    const first = saved(
      buildTagAccumulation(
        base,
        ['あ'],
        NOW,
        'partial-results',
        new Map([['あ', 12]]),
      ),
    )
    const again = buildTagAccumulation(
      first,
      ['あ', 'い'],
      NOW,
      'partial-results',
      new Map([
        ['あ', 12],
        ['い', 40],
      ]),
    )
    expect(again.data.popularity.scores).toBe(
      encodeTagPopularity(first.popularity?.levels ?? []),
    )
  })
})
