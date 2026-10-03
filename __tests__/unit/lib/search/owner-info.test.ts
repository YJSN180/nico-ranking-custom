import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  BoundedTtlCache,
  sanitizeUserIds,
  sanitizeChannelVideoIds,
  parseUserInfo,
  parseChannelInfo,
  fetchOwnerInfo,
  clearOwnerInfoCache,
  authorIdsMatchingNames,
  OWNER_INFO_MAX_USERS,
  OWNER_INFO_MAX_CHANNEL_VIDEOS,
} from '@/lib/search/owner-info'

describe('sanitizeUserIds / sanitizeChannelVideoIds', () => {
  it('形式不正・重複を除き上限で打ち切る', () => {
    expect(sanitizeUserIds('1, 22,1,abc,<x>,333')).toEqual(['1', '22', '333'])
    expect(sanitizeUserIds(Array.from({ length: 80 }, (_, i) => String(i + 1)).join(','))).toHaveLength(OWNER_INFO_MAX_USERS)
    expect(sanitizeUserIds(null)).toEqual([])
    expect(sanitizeChannelVideoIds('so1,sm2,so1,bad')).toEqual(['so1', 'sm2'])
    expect(sanitizeChannelVideoIds('ss3,ab4')).toEqual(['ss3'])
    expect(sanitizeChannelVideoIds(Array.from({ length: 30 }, (_, i) => `so${i + 1}`).join(','))).toHaveLength(OWNER_INFO_MAX_CHANNEL_VIDEOS)
  })
})

describe('parseUserInfo / parseChannelInfo', () => {
  it('nvapi /v1/users の nickname と icons.small を取り出す', () => {
    expect(parseUserInfo({ data: { user: { nickname: 'テストユーザー', icons: { small: 'https://icon/s.jpg', large: 'https://icon/l.jpg' } } } })).toEqual({
      name: 'テストユーザー',
      icon: 'https://icon/s.jpg',
    })
    expect(parseUserInfo({ data: { user: { nickname: 'x' } } })).toEqual({ name: 'x', icon: undefined })
    expect(parseUserInfo({ meta: { status: 404 } })).toBeNull()
    expect(parseUserInfo(null)).toBeNull()
  })

  it('v3_guest の data.channel から id/name/thumbnail を取り出し、ユーザー動画(channel null)は null', () => {
    expect(
      parseChannelInfo({ data: { channel: { id: 'ch1234567', name: 'テストチャンネル', thumbnail: { url: 'https://c/128.jpg', smallUrl: 'https://c/64.jpg' } } } })
    ).toEqual({ id: 'ch1234567', info: { name: 'テストチャンネル', icon: 'https://c/64.jpg' } })
    expect(parseChannelInfo({ data: { channel: null, owner: { nickname: 'u' } } })).toBeNull()
    expect(parseChannelInfo(undefined)).toBeNull()
  })
})

describe('fetchOwnerInfo', () => {
  beforeEach(() => clearOwnerInfoCache())

  const makeFetch = (calls: string[]) =>
    vi.fn(async (url: string) => {
      calls.push(url)
      if (url.includes('/v1/users/')) {
        const id = url.split('/').pop()!
        // 退会済み: nvapi は 404 と NOT_FOUND の本文を返す（2026-09-27 実測）
        if (id === '2') return { ok: false, status: 404, json: async () => ({ meta: { status: 404, errorCode: 'NOT_FOUND' } }) } as unknown as Response
        // 本文の無い 404（CDN やプロキシの応答など）
        if (id === '7') return { ok: false, status: 404, json: async () => { throw new SyntaxError('not json') } } as unknown as Response
        if (id === '3') throw new Error('network')
        return { ok: true, json: async () => ({ data: { user: { nickname: `user-${id}`, icons: { small: `https://i/${id}.jpg` } } } }) } as unknown as Response
      }
      const vid = url.match(/v3_guest\/(\w+)/)![1]
      if (vid === 'so9') return { ok: true, json: async () => ({ data: { channel: null } }) } as unknown as Response
      return { ok: true, json: async () => ({ data: { channel: { id: `ch-${vid}`, name: `channel-${vid}`, thumbnail: { smallUrl: `https://c/${vid}.jpg` } } } }) } as unknown as Response
    })

  it('ユーザーは nvapi、チャンネルは v3_guest から集め、404 は missing・他の失敗は failed に入れて部分成功で返す', async () => {
    const calls: string[] = []
    const fetchImpl = makeFetch(calls)
    const result = await fetchOwnerInfo(
      { userIds: ['1', '2', '3'], channelVideoIds: ['so5', 'so9'] },
      { fetchImpl: fetchImpl as unknown as typeof fetch, concurrency: 2 }
    )
    expect(result.users).toEqual({ '1': { name: 'user-1', icon: 'https://i/1.jpg' } })
    expect(result.channels).toEqual({ 'ch-so5': { name: 'channel-so5', icon: 'https://c/so5.jpg' } })
    expect(result.missing).toEqual(['2'])
    expect(result.failed.sort()).toEqual(['3', 'so9'])
    expect(calls).toHaveLength(5)
  })

 it('全件NOT_FOUNDなら経路障害と区別できず、非表示にも負キャッシュにも使わない', async () => {
    clearOwnerInfoCache()
    const calls: string[] = []
    const fetchImpl = makeFetch(calls) as unknown as typeof fetch
    const first = await fetchOwnerInfo({ userIds: ['2'], channelVideoIds: [] }, { fetchImpl })
    expect(first.missing).toEqual([])
    expect(first.failed).toEqual(['2'])
    await fetchOwnerInfo({ userIds: ['2'], channelVideoIds: [] }, { fetchImpl })
    expect(calls).toHaveLength(2)
  })
  it('404 は本文で NOT_FOUND を確かめてから退会扱いにし、本文の無い 404 は失敗（failed）にして覚えない', async () => {
    const calls: string[] = []
    const fetchImpl = makeFetch(calls) as unknown as typeof fetch
    const first = await fetchOwnerInfo({ userIds: ['7'], channelVideoIds: [] }, { fetchImpl })
    expect(first.missing).toEqual([])
    expect(first.failed).toEqual(['7'])
    await fetchOwnerInfo({ userIds: ['7'], channelVideoIds: [] }, { fetchImpl })
    expect(calls).toHaveLength(2)
  })

  it('退会済みの記憶は 1 時間で捨てて問い合わせ直す（404 の本文は経路の誤りでも同じなので、長く固定しない）', async () => {
    const calls: string[] = []
    const fetchImpl = makeFetch(calls) as unknown as typeof fetch
    await fetchOwnerInfo({ userIds: ['1', '2'], channelVideoIds: [] }, { fetchImpl, now: 0 })
    await fetchOwnerInfo({ userIds: ['2'], channelVideoIds: [] }, { fetchImpl, now: 59 * 60 * 1000 })
    expect(calls).toHaveLength(2)
    await fetchOwnerInfo({ userIds: ['2'], channelVideoIds: [] }, { fetchImpl, now: 61 * 60 * 1000 })
    expect(calls).toHaveLength(3)
  })

  it('退会済み(404)もメモし、再照会しない', async () => {
    const calls: string[] = []
    const fetchImpl = makeFetch(calls) as unknown as typeof fetch
    await fetchOwnerInfo({ userIds: ['1', '2'], channelVideoIds: [] }, { fetchImpl })
    const second = await fetchOwnerInfo({ userIds: ['2'], channelVideoIds: [] }, { fetchImpl })
    expect(second.missing).toEqual(['2'])
    expect(calls).toHaveLength(2)
  })

  it('取得済みの投稿者はメモリキャッシュから返し、再取得しない', async () => {
    const calls: string[] = []
    const fetchImpl = makeFetch(calls) as unknown as typeof fetch
    await fetchOwnerInfo({ userIds: ['1'], channelVideoIds: ['so5'] }, { fetchImpl })
    const second = await fetchOwnerInfo({ userIds: ['1'], channelVideoIds: ['so5'] }, { fetchImpl })
    expect(calls).toHaveLength(2)
    expect(second.users['1']?.name).toBe('user-1')
    expect(second.channels['ch-so5']?.name).toBe('channel-so5')
  })

  it('全体の期限が切れたら、まだ問い合わせていない分は問い合わせずに failed にする', async () => {
    const calls: string[] = []
    const inner = makeFetch(calls)
    const deadline = new AbortController()
    // 最初の2件の本文を受け取る前に期限が切れる。実行中と待機中の両方を中断する。
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      const res = await inner(url)
      if (calls.length === 2) deadline.abort()
      return res
    })
    const result = await fetchOwnerInfo(
      { userIds: ['1', '4', '5', '6'], channelVideoIds: ['so5'] },
      { fetchImpl: fetchImpl as unknown as typeof fetch, concurrency: 2, signal: deadline.signal }
    )
    expect(calls).toHaveLength(2)
    expect(Object.keys(result.users)).toEqual([])
    expect(result.failed.sort()).toEqual(['1', '4', '5', '6', 'so5'])
  })

  it('1 回の呼び出しで上流へ問い合わせる件数は 25 件まで（関数の上限時間に収める）', () => {
    expect(OWNER_INFO_MAX_USERS + OWNER_INFO_MAX_CHANNEL_VIDEOS).toBeLessThanOrEqual(25)
  })

  it('TTL を過ぎたキャッシュは使わない', async () => {
    const calls: string[] = []
    const fetchImpl = makeFetch(calls) as unknown as typeof fetch
    await fetchOwnerInfo({ userIds: ['1'], channelVideoIds: [] }, { fetchImpl, now: 0 })
    await fetchOwnerInfo({ userIds: ['1'], channelVideoIds: [] }, { fetchImpl, now: 25 * 60 * 60 * 1000 })
    expect(calls).toHaveLength(2)
  })
})

describe('authorIdsMatchingNames', () => {
  it('名前が条件に当たる投稿者を、検索結果の投稿者 ID の形（ユーザーは数字、チャンネルは channel/chNNN）で返す', () => {
    const result = {
      users: { '1001': { name: 'safe' }, '1002': { name: 'ng-name' } },
      channels: { ch3003: { name: 'ng-channel' }, ch3004: { name: 'safe-channel' } },
      missing: ['1005'],
      failed: [],
    }
    expect(authorIdsMatchingNames(result, (name) => name.startsWith('ng-'))).toEqual(['1002', 'channel/ch3003'])
  })
})

describe('BoundedTtlCache（投稿者情報のメモリキャッシュ）', () => {
  it('上限を超えたら古いものから捨てる', () => {
    const cache = new BoundedTtlCache<string>(2)
    cache.set('a', 'A', 100)
    cache.set('b', 'B', 100)
    cache.set('c', 'C', 100)
    expect(cache.get('a', 0)).toBeUndefined()
    expect(cache.get('b', 0)).toBe('B')
    expect(cache.get('c', 0)).toBe('C')
    expect(cache.size).toBe(2)
  })

  it('期限を過ぎたものは返さずに捨てる。入れ直すと新しい扱いになる', () => {
    const cache = new BoundedTtlCache<string>(2)
    cache.set('a', 'A', 10)
    expect(cache.get('a', 10)).toBeUndefined()
    expect(cache.size).toBe(0)
    cache.set('x', 'X', 100)
    cache.set('y', 'Y', 100)
    cache.set('x', 'X2', 100)
    cache.set('z', 'Z', 100)
    expect(cache.get('y', 0)).toBeUndefined()
    expect(cache.get('x', 0)).toBe('X2')
  })

})
