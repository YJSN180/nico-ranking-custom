import { describe, it, expect } from 'vitest'
import {
  normalizeText,
  containsSubsequence,
  matchesSubsequenceNeedle,
  containsNormalized,
  matchesAnySubsequenceNeedle,
} from '@/lib/lqng/normalize'

// 固定データは合成値のみ（実在の名前や ID は使わない）
const NEEDLE = 'てすとまん'

describe('normalizeText', () => {
  it('カタカナ・半角カナ・全角英数をひらがな/半角に揃える', () => {
    expect(normalizeText('テストマン')).toBe('てすとまん')
    expect(normalizeText('ﾃｽﾄﾏﾝ')).toBe('てすとまん')
    expect(normalizeText('ＡＢＣ１２３')).toBe('abc123')
  })

  it('小書き仮名を通常形に寄せ、分離濁点を結合する', () => {
    expect(normalizeText('きゅうり')).toBe('きゆうり')
    expect(normalizeText('が')).toBe('が') // か + 結合濁点
    expect(normalizeText('ﾊﾞ')).toBe('ば')
  })

  it('ゼロ幅文字・結合記号・異体字セレクタを除去する', () => {
    expect(normalizeText('て​す‍と️ま́ん')).toBe('てすとまん')
  })

  it('記号・英数字は残す（一致側で挿入を許容する）', () => {
    expect(normalizeText('て/す.と-ま\\ん')).toBe('て/す.と-ま\\ん')
  })
})

describe('containsSubsequence / matchesSubsequenceNeedle', () => {
  it('順序どおりに現れれば挿入文字の数と種類を問わず一致する', () => {
    expect(containsSubsequence('てすとまん', 'てすとまん')).toBe(true)
    expect(containsSubsequence('て/す/と/ま/ん', 'てすとまん')).toBe(true)
    expect(containsSubsequence('てaすbbとccc😀まzzzzん', 'てすとまん')).toBe(true)
    expect(containsSubsequence('てすまとん', 'てすとまん')).toBe(false)
    expect(containsSubsequence('てすとま', 'てすとまん')).toBe(false)
    expect(containsSubsequence('abc', '')).toBe(false)
  })

  it('正規化を通してから一致判定する', () => {
    expect(matchesSubsequenceNeedle('ﾃ、ｽ。ﾄ／ﾏ＼ﾝ', NEEDLE)).toBe(true)
    expect(matchesSubsequenceNeedle('テストマンねんねしな', NEEDLE)).toBe(true)
    expect(matchesSubsequenceNeedle('てすと', NEEDLE)).toBe(false)
    expect(matchesAnySubsequenceNeedle('無関係なタイトル', [NEEDLE, 'べつのご'])).toBe(false)
    expect(matchesAnySubsequenceNeedle('べ.つ.の.ご', [NEEDLE, 'べつのご'])).toBe(true)
  })

  it('照合語が空なら一致しない', () => {
    expect(matchesSubsequenceNeedle('なんでも', '')).toBe(false)
    expect(matchesSubsequenceNeedle('なんでも', '　')).toBe(false)
  })
})

describe('containsNormalized', () => {
  it('部分一致（連続）は挿入を許さない', () => {
    expect(containsNormalized('ホモと見る何か', 'ほもと見る')).toBe(true)
    expect(containsNormalized('ホモ・と・見る', 'ほもと見る')).toBe(false)
    expect(containsNormalized('ホモと見る', '')).toBe(false)
  })
})
