// @vitest-environment node
// /api/search 系のインスタンスごとの流量制限（トークンバケツ）のテスト
import { describe, it, expect } from 'vitest'
import { createTokenBucket, tooManyRequests } from '@/lib/search/rate-limit'

describe('createTokenBucket', () => {
  it('容量までは続けて受け、使い切ったら次に取れるまでの秒数を返す', () => {
    const bucket = createTokenBucket(3, 1)
    expect([bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([0, 0, 0])
    expect(bucket.take(0)).toBe(1)
  })

  it('時間の経過で毎秒の量だけ戻り、容量を超えては貯まらない', () => {
    const bucket = createTokenBucket(2, 2)
    bucket.take(0)
    bucket.take(0)
    expect(bucket.take(0)).toBeGreaterThan(0)
    // 0.5 秒で 1 つ戻る
    expect(bucket.take(500)).toBe(0)
    expect(bucket.take(500)).toBeGreaterThan(0)
    // 長く空いても容量（2）までしか貯まらない
    expect([bucket.take(60_000), bucket.take(60_000)]).toEqual([0, 0])
    expect(bucket.take(60_000)).toBeGreaterThan(0)
  })

  it('reset で満杯に戻す', () => {
    const bucket = createTokenBucket(1, 0.1)
    bucket.take(0)
    expect(bucket.take(0)).toBe(10)
    bucket.reset()
    expect(bucket.take(0)).toBe(0)
  })
})

describe('tooManyRequests', () => {
  it('429 と Retry-After を返し、CDN に置かない', async () => {
    const res = tooManyRequests(3)
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('3')
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(await res.json()).toEqual({ error: 'rate_limited' })
  })
})
