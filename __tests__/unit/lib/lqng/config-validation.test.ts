import { describe, it, expect } from 'vitest'
import { LQNG_POLL_TAGS_MAX, LQNG_TITLE_NEEDLE_MIN_LENGTH, validateLqngConfigInput } from '@/lib/lqng/config'

// 合成値のみ
const valid = {
  enabled: true,
  pollTags: ['t1'],
  titleNeedles: ['てすとまん'],
  keywordNeedles: ['き'],
  tagGroups: [['a'], ['b'], ['c']],
  lockGroupsMin: 3,
  freq: { dayCount: 5, burstCount: 3, burstMinutes: 30 },
  followerMax: 10,
  holdHours: 6,
  trackDays: 7,
  deletionWindowDays: 7,
}

describe('validateLqngConfigInput', () => {
  it('妥当な設定は問題なし。数値を省いた項目は既定値になるので問題にしない', () => {
    expect(validateLqngConfigInput(valid)).toEqual([])
    expect(validateLqngConfigInput({ enabled: false })).toEqual([])
    expect(validateLqngConfigInput({ ...valid, followerMax: 0, holdHours: 0, trackDays: 30, deletionWindowDays: 30, freq: { dayCount: 100, burstCount: 100, burstMinutes: 1440 } })).toEqual([])
  })

  it('照合語は正規化後 3 文字以上（全角英数・ゼロ幅文字も正規化してから数える）', () => {
    expect(LQNG_TITLE_NEEDLE_MIN_LENGTH).toBe(3)
    expect(validateLqngConfigInput({ ...valid, titleNeedles: ['テスト', 'abc'] })).toEqual([])
    const problems = validateLqngConfigInput({ ...valid, titleNeedles: ['てすとまん', 'ＡＢ', 'あ​い', 'か'] })
    expect(problems).toHaveLength(3)
    expect(problems[0]).toContain('照合語「ＡＢ」は正規化すると 2 文字です')
    expect(problems[1]).toContain('2 文字')
    expect(problems[2]).toContain('照合語「か」は正規化すると 1 文字です')
  })

  it('ポーリング対象タグは 3 つまで（4 つ目からは Worker が取得しない）', () => {
    expect(LQNG_POLL_TAGS_MAX).toBe(3)
    expect(validateLqngConfigInput({ ...valid, pollTags: ['t1', 't2', 't3'] })).toEqual([])
    expect(validateLqngConfigInput({ ...valid, pollTags: ['t1', 't2', 't3', 't4'] })).toEqual(['対象タグは 3 つまでにしてください（4 つ目からは新着を取得しません）'])
  })

  it('数値は整数で、項目ごとの下限・上限の範囲に収める', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ followerMax: 1001 }, 'フォロワー上限は 0〜1000 の整数にしてください'],
      [{ followerMax: -1 }, 'フォロワー上限は 0〜1000 の整数にしてください'],
      [{ holdHours: 169 }, '保留時間は 0〜168 の整数にしてください'],
      [{ trackDays: 0 }, '投稿者の追跡日数は 1〜30 の整数にしてください'],
      [{ trackDays: 31 }, '投稿者の追跡日数は 1〜30 の整数にしてください'],
      [{ deletionWindowDays: 31 }, '削除とみなす日数は 1〜30 の整数にしてください'],
      [{ lockGroupsMin: 0 }, 'ロック群の閾値は 1〜20 の整数にしてください'],
      [{ freq: { dayCount: 0, burstCount: 3, burstMinutes: 30 } }, '24 時間の本数は 1〜100 の整数にしてください'],
      [{ freq: { dayCount: 5, burstCount: 101, burstMinutes: 30 } }, '短時間の本数は 1〜100 の整数にしてください'],
      [{ freq: { dayCount: 5, burstCount: 3, burstMinutes: 1441 } }, '短時間の幅は 1〜1440 の整数にしてください'],
      [{ holdHours: 1.5 }, '保留時間は 0〜168 の整数にしてください'],
      [{ holdHours: '6' }, '保留時間は 0〜168 の整数にしてください'],
      [{ holdHours: null }, '保留時間は 0〜168 の整数にしてください'],
    ]
    for (const [override, message] of cases) {
      expect(validateLqngConfigInput({ ...valid, ...override })).toEqual([message])
    }
  })

  it('有効にするにはポーリング対象タグが必要で、ロック群の閾値はグループ数以下', () => {
    expect(validateLqngConfigInput({ ...valid, pollTags: [] })).toEqual(['有効にするにはポーリング対象タグが 1 つ以上必要です'])
    expect(validateLqngConfigInput({ ...valid, enabled: false, pollTags: [] })).toEqual([])
    expect(validateLqngConfigInput({ ...valid, tagGroups: [['a']], lockGroupsMin: 2 })).toEqual(['ロック群の閾値がグループ数を超えています'])
  })

  it('オブジェクトでなければ形式の問題として返す', () => {
    expect(validateLqngConfigInput(null)).toEqual(['設定の形式が正しくありません'])
    expect(validateLqngConfigInput([1])).toEqual(['設定の形式が正しくありません'])
  })
})
