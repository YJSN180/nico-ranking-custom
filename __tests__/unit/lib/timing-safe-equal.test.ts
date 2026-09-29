// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { timingSafeEqual } from '@/lib/timing-safe-equal'

// 秘密の値の比較。結果は === と同じで、比べる時間は値の中身にも長さにもよらない
// （両方を SHA-256 にしてから 32 バイトを全部比べる）

describe('timingSafeEqual', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['同じ値', 'synthetic-pass', 'synthetic-pass', true],
    ['空どうし', '', '', true],
    ['同じ長さで末尾だけ違う', 'synthetic-pass', 'synthetic-pasS', false],
    ['前方一致（長さが違う）', 'synthetic-pass', 'synthetic-pass-longer', false],
    ['片方が空', '', 'synthetic-pass', false],
    ['日本語', '合成パスワード', '合成パスワード', true],
    ['コロンを含む', 'a:b:c', 'a:b:c', true],
  ])('%s', async (_label, a, b, expected) => {
    await expect(timingSafeEqual(a, b)).resolves.toBe(expected)
  })

  it('一致しなくても両方の値を必ずハッシュする（途中で打ち切らない）', async () => {
    const digest = vi.spyOn(crypto.subtle, 'digest')

    await timingSafeEqual('x', 'synthetic-pass-longer')

    expect(digest).toHaveBeenCalledTimes(2)
  })
})
