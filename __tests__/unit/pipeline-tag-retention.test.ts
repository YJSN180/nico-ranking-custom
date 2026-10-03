// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../scripts/lib/r2-store', () => ({
  createR2Store: () => ({ read: vi.fn() }),
}))
import {
  MAX_ACCUMULATED_TAGS,
  TAG_RETENTION_DAYS,
  buildTagAccumulation,
  decodeLastSeen,
  encodeLastSeen,
  mergeTagAccumulation,
  serializeTagAccumulation,
  tagHash,
  toEpochDay,
  writeTagAccumulationFile,
} from '../../scripts/accumulate-tags'

const NOW = new Date('2026-10-03T12:00:00Z')
const TODAY = toEpochDay(NOW)

// 現行の並び順（localeCompare）をそのまま基準にする
const japaneseOrder = (a: string, b: string): number =>
  a.localeCompare(b, 'ja', { numeric: true, caseFirst: 'lower' })

function dayMap(result: { tags: string[]; lastSeenDays: number[] }): Map<string, number> {
  return new Map(result.tags.map((tag, i) => [tag, result.lastSeenDays[i]]))
}

function legacyDay(tag: string): number {
  return TODAY - 1 - (tagHash(tag) % (TAG_RETENTION_DAYS - 1))
}

// 日付の新しい順、同じ日はハッシュ順で上位 n 件
function topByRecency(entries: Array<[string, number]>, n: number): Set<string> {
  const ranked = [...entries].sort(
    ([tagA, dayA], [tagB, dayB]) => dayB - dayA || tagHash(tagA) - tagHash(tagB),
  )
  return new Set(ranked.slice(0, n).map(([tag]) => tag))
}

const legacyTags = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `タグ${i}`)

describe('toEpochDay', () => {
  it('counts whole UTC days since the epoch', () => {
    expect(toEpochDay(new Date('1970-01-02T00:00:00Z'))).toBe(1)
    expect(toEpochDay(new Date('2026-10-03T00:00:00Z'))).toBe(TODAY)
    expect(toEpochDay(new Date('2026-10-03T23:59:59Z'))).toBe(TODAY)
    expect(toEpochDay(new Date('2026-10-02T23:59:59Z'))).toBe(TODAY - 1)
  })
})

describe('mergeTagAccumulation', () => {
  it('spreads legacy tags deterministically over the past 29 days and refreshes seen tags', () => {
    const tags = legacyTags(2000)
    const first = mergeTagAccumulation({ tags }, ['タグ5', '新しいタグ'], TODAY)
    const second = mergeTagAccumulation({ tags: [...tags] }, ['新しいタグ', 'タグ5'], TODAY)
    expect(second).toEqual(first)
    expect(first.stats).toMatchObject({ legacy: true, expired: 0, capped: 0, added: 1, seen: 2 })

    const days = dayMap(first)
    expect(days.get('タグ5')).toBe(TODAY)
    expect(days.get('新しいタグ')).toBe(TODAY)
    const spread = new Set<number>()
    for (const tag of tags) {
      if (tag === 'タグ5') continue
      const day = days.get(tag)
      expect(day).toBe(legacyDay(tag))
      spread.add(day ?? Number.NaN)
    }
    // 昨日〜29日前のすべての日に散らばる
    expect(Math.max(...spread)).toBe(TODAY - 1)
    expect(Math.min(...spread)).toBe(TODAY - 29)
    expect(spread.size).toBe(29)
  })

  it('applies the cap to legacy tags by pseudo day and hash, keeping every seen tag', () => {
    const tags = legacyTags(1000)
    const seen = ['タグ1', 'タグ999', '新規A', '新規B']
    const result = mergeTagAccumulation({ tags }, seen, TODAY, { maxTags: 300 })
    expect(result.tags).toHaveLength(300)
    expect(result.stats).toMatchObject({ legacy: true, capped: 702, expired: 0, added: 2 })
    for (const tag of seen) expect(result.tags).toContain(tag)

    const candidates: Array<[string, number]> = tags
      .filter(tag => !seen.includes(tag))
      .map(tag => [tag, legacyDay(tag)])
    const expected = topByRecency(candidates, 300 - seen.length)
    expect(new Set(result.tags.filter(tag => !seen.includes(tag)))).toEqual(expected)
    // 特定の範囲だけが残る・消えることはない（100件ごとのどの区間にも残りがある）
    for (let block = 0; block < 10; block++) {
      const kept = result.tags.filter(tag => {
        const n = Number(tag.replace('タグ', ''))
        return Number.isInteger(n) && Math.floor(n / 100) === block
      })
      expect(kept.length).toBeGreaterThan(0)
    }
  })

  it('drops tags last seen before the 30-day window, including today', () => {
    const result = mergeTagAccumulation(
      {
        tags: ['今日', '29日前', '30日前', '古い'],
        lastSeenDays: [TODAY, TODAY - 29, TODAY - 30, TODAY - 400],
      },
      ['今回'],
      TODAY,
    )
    expect(dayMap(result)).toEqual(new Map([
      ['今日', TODAY],
      ['29日前', TODAY - 29],
      ['今回', TODAY],
    ]))
    expect(result.stats).toMatchObject({ legacy: false, expired: 2, capped: 0, oldestAgeDays: 29 })
  })

  it('keeps the most recently seen tags over the cap and breaks ties by hash', () => {
    const sameDay = Array.from({ length: 20 }, (_, i) => `同日${i}`)
    const tags = ['最新', '昨日', ...sameDay, '古め']
    const lastSeenDays = [TODAY, TODAY - 1, ...sameDay.map(() => TODAY - 5), TODAY - 10]
    const result = mergeTagAccumulation({ tags, lastSeenDays }, ['今回'], TODAY, { maxTags: 10 })

    const kept = new Set(result.tags)
    expect(kept.size).toBe(10)
    for (const tag of ['今回', '最新', '昨日']) expect(kept.has(tag)).toBe(true)
    expect(kept.has('古め')).toBe(false)
    // 上限で落ちた後に残っている最も古い日（実際に残っている期間）
    expect(result.stats.oldestAgeDays).toBe(5)
    const expectedSameDay = [...sameDay].sort((a, b) => tagHash(a) - tagHash(b)).slice(0, 7)
    expect(new Set(sameDay.filter(tag => kept.has(tag)))).toEqual(new Set(expectedSameDay))
    expect(result.stats.capped).toBe(14)
    // 入力の順序が違っても同じ結果になる
    const reversed = mergeTagAccumulation(
      { tags: [...tags].reverse(), lastSeenDays: [...lastSeenDays].reverse() },
      ['今回'],
      TODAY,
      { maxTags: 10 },
    )
    expect(reversed.tags).toEqual(result.tags)
    expect(reversed.lastSeenDays).toEqual(result.lastSeenDays)
  })

  it('refreshes the day of seen tags, including ones that would have expired', () => {
    const result = mergeTagAccumulation(
      { tags: ['途中', '期限切れ', 'そのまま'], lastSeenDays: [TODAY - 20, TODAY - 35, TODAY - 3] },
      ['途中', '期限切れ'],
      TODAY,
    )
    expect(dayMap(result)).toEqual(new Map([
      ['途中', TODAY],
      ['期限切れ', TODAY],
      ['そのまま', TODAY - 3],
    ]))
    expect(result.stats).toMatchObject({ added: 0, expired: 0, seen: 2 })
  })

  it('returns tags in Japanese collation order with aligned lastSeenDays', () => {
    const tags = ['ゲーム', 'あにめ', 'アニメ', '東方', 'Zebra', 'apple', 'Apple', '動画10', '動画2', '123']
    const lastSeenDays = tags.map((_, i) => TODAY - i)
    const result = mergeTagAccumulation({ tags, lastSeenDays }, ['初音ミク', 'ボカロ'], TODAY)

    expect(result.tags).toEqual([...tags, '初音ミク', 'ボカロ'].sort(japaneseOrder))
    expect(result.lastSeenDays).toHaveLength(result.tags.length)
    const expected = new Map<string, number>(tags.map((tag, i) => [tag, TODAY - i]))
    expected.set('初音ミク', TODAY)
    expected.set('ボカロ', TODAY)
    expect(dayMap(result)).toEqual(expected)
  })

  it('keeps the cleaning rules: trims, drops empty or over-long tags, dedupes with the newest day', () => {
    const result = mergeTagAccumulation(
      {
        tags: [' 重複 ', '重複', '', '   ', 'x'.repeat(101), 'y'.repeat(100), '未来'],
        lastSeenDays: [TODAY - 9, TODAY - 2, TODAY, TODAY, TODAY, TODAY - 1, TODAY + 5],
      },
      ['  今回  ', '', 'z'.repeat(101), 42 as unknown as string],
      TODAY,
    )
    expect(dayMap(result)).toEqual(new Map([
      ['重複', TODAY - 2],
      ['y'.repeat(100), TODAY - 1],
      ['未来', TODAY],
      ['今回', TODAY],
    ]))
    expect(result.stats.seen).toBe(1)
  })

  it('treats misaligned lastSeenDays as legacy instead of failing', () => {
    const tags = ['あ', 'い', 'う']
    for (const lastSeenDays of [[TODAY], [TODAY, TODAY, 1.5], [TODAY, Number.NaN, TODAY]]) {
      const result = mergeTagAccumulation({ tags, lastSeenDays }, ['え'], TODAY)
      expect(result.stats.legacy).toBe(true)
      const days = dayMap(result)
      for (const tag of tags) expect(days.get(tag)).toBe(legacyDay(tag))
    }
  })

  it('handles 600k existing and 100k seen tags quickly', () => {
    const chars = 'あいうえおかきくけこアイウエオカキクケコ東方初音実況歌踊ABCabcー'
    let seed = 42
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const word = (i: number): string => {
      let text = ''
      const length = 2 + Math.floor(random() * 10)
      for (let j = 0; j < length; j++) text += chars[Math.floor(random() * chars.length)]
      return `${text}${i}`
    }
    const existing = Array.from({ length: 600_000 }, (_, i) => word(i))
    // 半分は既存、半分は新しいタグ
    const seen = [
      ...existing.slice(0, 50_000),
      ...Array.from({ length: 50_000 }, (_, i) => `新${word(i)}`),
    ]

    const started = performance.now()
    const result = mergeTagAccumulation({ tags: existing }, seen, TODAY)
    const elapsed = performance.now() - started

    expect(result.tags).toHaveLength(MAX_ACCUMULATED_TAGS)
    expect(result.lastSeenDays).toHaveLength(MAX_ACCUMULATED_TAGS)
    expect(result.stats).toMatchObject({ seen: 100_000, added: 50_000, capped: 350_000 })
    expect(result.lastSeenDays.filter(day => day === TODAY)).toHaveLength(100_000)
    // 厳密な時間ではなく、O(n^2) にならないことを緩く確かめる
    expect(elapsed).toBeLessThan(15_000)
  }, 60_000)
})

describe('buildTagAccumulation', () => {
  const existing = {
    tags: ['あ', 'い'],
    lastSeenDays: [TODAY - 1, TODAY - 2],
    metadata: { version: 7, weeklyUpdateCount: 41 },
  }

  it('writes aligned last-seen ages and retention metadata', () => {
    const { data, stats } = buildTagAccumulation(existing, ['う'], NOW, 'partial-results')
    expect(data).toEqual({
      tags: ['あ', 'い', 'う'],
      lastSeen: { day: TODAY, ages: '120' },
      metadata: {
        version: 8,
        lastUpdated: NOW.toISOString(),
        totalUniqueTags: 3,
        lastAccumulationSource: 'partial-results',
        weeklyUpdateCount: 42,
        retentionDays: 30,
        maxTags: 300_000,
      },
    })
    expect(stats.added).toBe(1)
  })

  it('serializes compact JSON that round-trips', () => {
    const { data } = buildTagAccumulation(existing, ['う'], NOW, 'partial-results')
    const text = serializeTagAccumulation(data)
    expect(text).not.toContain('\n')
    expect(text).not.toMatch(/": |, "/)
    expect(text).toBe(`{"tags":["あ","い","う"],"lastSeen":{"day":${TODAY},"ages":"120"},"metadata":${JSON.stringify(data.metadata)}}`)
    expect(JSON.parse(text)).toEqual(data)
  })

  it('refuses to save when this run extracted no tags', () => {
    expect(() => buildTagAccumulation(existing, [], NOW, 'kv-fallback')).toThrow('extracted no tags')
    expect(() => buildTagAccumulation(existing, ['', '  '], NOW, 'kv-fallback')).toThrow('extracted no tags')
  })

  it('refuses to shrink a large dictionary below 10,000 tags', () => {
    const tags = legacyTags(10_000)
    const stale = { tags, lastSeenDays: tags.map(() => TODAY - 40), metadata: existing.metadata }
    expect(() => buildTagAccumulation(stale, ['今回'], NOW, 'partial-results')).toThrow('Refusing to save')
    // 既存が少ないときは減ってもよい
    const small = { tags: tags.slice(0, 9_999), lastSeenDays: tags.slice(0, 9_999).map(() => TODAY - 40), metadata: existing.metadata }
    expect(buildTagAccumulation(small, ['今回'], NOW, 'partial-results').data.tags).toEqual(['今回'])
  })

  it('starts a new dictionary from a confirmed missing object', () => {
    const empty = { tags: [], metadata: { version: 1, weeklyUpdateCount: 1 } }
    const { data, stats } = buildTagAccumulation(empty, ['い', 'あ'], NOW, 'partial-results')
    expect(data.tags).toEqual(['あ', 'い'])
    expect(data.lastSeen).toEqual({ day: TODAY, ages: '00' })
    expect(data.metadata.version).toBe(2)
    expect(stats).toMatchObject({ legacy: false, added: 2 })
  })

  it('migrates a large legacy dictionary without tripping the guard', () => {
    const legacy = { tags: legacyTags(20_000), metadata: existing.metadata }
    const { data, stats } = buildTagAccumulation(legacy, ['今回'], NOW, 'partial-results')
    expect(stats.legacy).toBe(true)
    expect(data.tags).toHaveLength(20_001)
    const days = decodeLastSeen(data.tags, data.lastSeen)
    expect(days?.every(day => day >= TODAY - 29 && day <= TODAY)).toBe(true)
  })
})

describe('last-seen encoding', () => {
  it('round-trips days of 0..35 days ago as one base-36 character each', () => {
    const days = Array.from({ length: 36 }, (_, age) => TODAY - age)
    const encoded = encodeLastSeen(days, TODAY)
    expect(encoded).toEqual({ day: TODAY, ages: '0123456789abcdefghijklmnopqrstuvwxyz' })
    expect(decodeLastSeen(days, encoded)).toEqual(days)
  })

  it('refuses ages it cannot write in one character', () => {
    expect(() => encodeLastSeen([TODAY + 1], TODAY)).toThrow('last-seen age')
    expect(() => encodeLastSeen([TODAY - 36], TODAY)).toThrow('last-seen age')
    expect(() => encodeLastSeen([TODAY - 1.5], TODAY)).toThrow('last-seen age')
  })

  it('keeps the dates through a save and the next merge', () => {
    const first = buildTagAccumulation(
      { tags: ['あ', 'い'], lastSeenDays: [TODAY - 3, TODAY - 7], metadata: { version: 1, weeklyUpdateCount: 1 } },
      ['う'],
      NOW,
      'partial-results',
    )
    const saved: unknown = JSON.parse(serializeTagAccumulation(first.data))
    const lastSeenDays = decodeLastSeen(first.data.tags, (saved as { lastSeen: unknown }).lastSeen)
    expect(lastSeenDays).toEqual([TODAY - 3, TODAY - 7, TODAY])

    const nextDay = new Date(NOW.getTime() + 86_400_000)
    const second = buildTagAccumulation(
      { tags: first.data.tags, lastSeenDays: lastSeenDays ?? undefined, metadata: first.data.metadata },
      ['い'],
      nextDay,
      'partial-results',
    )
    expect(second.stats.legacy).toBe(false)
    expect(second.data.lastSeen).toEqual({ day: TODAY + 1, ages: '401' })
  })
})

describe('writeTagAccumulationFile', () => {
  const existing = {
    tags: ['あ', 'い'],
    lastSeenDays: [TODAY - 1, TODAY - 2],
    metadata: { version: 7, weeklyUpdateCount: 41 },
  }
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tag-accumulation-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes the built data as compact JSON', async () => {
    const output = join(dir, 'tag-accumulation.json')
    const { data } = await writeTagAccumulationFile(existing, ['う'], NOW, 'partial-results', output)

    const text = await readFile(output, 'utf8')
    expect(text).not.toContain('\n')
    expect(text).toBe(serializeTagAccumulation(data))
    expect(JSON.parse(text)).toEqual(buildTagAccumulation(existing, ['う'], NOW, 'partial-results').data)
  })

  it.each([
    ['no tags were extracted', existing, [] as string[]],
    ['a large dictionary would shrink below 10,000 tags', {
      tags: legacyTags(10_000),
      lastSeenDays: legacyTags(10_000).map(() => TODAY - 40),
      metadata: existing.metadata,
    }, ['今回']],
  ])('throws without creating the file when %s', async (_label, current, seen) => {
    const output = join(dir, 'tag-accumulation.json')

    await expect(writeTagAccumulationFile(current, seen, NOW, 'partial-results', output)).rejects.toThrow('Refusing to save')
    await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
