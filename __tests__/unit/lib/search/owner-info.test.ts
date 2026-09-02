import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sanitizeUserIds,
  sanitizeChannelVideoIds,
  parseUserInfo,
  parseChannelInfo,
  fetchOwnerInfo,
  clearOwnerInfoCache,
  OWNER_INFO_MAX_USERS,
  OWNER_INFO_MAX_CHANNEL_VIDEOS,
} from '@/lib/search/owner-info'

describe('sanitizeUserIds / sanitizeChannelVideoIds', () => {
  it('形式不正・重複を除き上限で打ち切る', () => {
    expect(sanitizeUserIds('1, 22,1,abc,<x>,333')).toEqual(['1', '22', '333'])
    expect(sanitizeUserIds(Array.from({ length: 80 }, (_, i) => String(i + 1)).join(','))).toHaveLength(OWNER_INFO_MAX_USERS)
    expect(sanitizeUserIds(null)).toEqual([])
    expect(sanitizeChannelVideoIds('so1,sm2,so1,bad')).toEqual(['so1', 'sm2'])
    expect(sanitizeChannelVideoIds(Array.from({ length: 30 }, (_, i) => `so${i + 1}`).join(','))).toHaveLength(OWNER_INFO_MAX_CHANNEL_VIDEOS)
  })
})

describe('parseUserInfo / parseChannelInfo', () => {
  it('nvapi /v1/users の nickname と icons.small を取り出す', () => {
    expect(parseUserInfo({ data: { user: { nickname: '海老ルーミア', icons: { small: 'https://icon/s.jpg', large: 'https://icon/l.jpg' } } } })).toEqual({
      name: '海老ルーミア',
      icon: 'https://icon/s.jpg',
    })
    expect(parseUserInfo({ data: { user: { nickname: 'x' } } })).toEqual({ name: 'x', icon: undefined })
    expect(parseUserInfo({ meta: { status: 404 } })).toBeNull()
    expect(parseUserInfo(null)).toBeNull()
  })

  it('v3_guest の data.channel から id/name/thumbnail を取り出し、ユーザー動画(channel null)は null', () => {
    expect(
      parseChannelInfo({ data: { channel: { id: 'ch2610989', name: 'がっこうぐらし！', thumbnail: { url: 'https://c/128.jpg', smallUrl: 'https://c/64.jpg' } } } })
    ).toEqual({ id: 'ch2610989', info: { name: 'がっこうぐらし！', icon: 'https://c/64.jpg' } })
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
        if (id === '2') return { ok: false, status: 404 } as unknown as Response
        if (id === '3') throw new Error('network')
        return { ok: true, json: async () => ({ data: { user: { nickname: `user-${id}`, icons: { small: `https://i/${id}.jpg` } } } }) } as unknown as Response
      }
      const vid = url.match(/v3_guest\/(\w+)/)![1]
      if (vid === 'so9') return { ok: true, json: async () => ({ data: { channel: null } }) } as unknown as Response
      return { ok: true, json: async () => ({ data: { channel: { id: `ch-${vid}`, name: `channel-${vid}`, thumbnail: { smallUrl: `https://c/${vid}.jpg` } } } }) } as unknown as Response
    })

  it('ユーザーは nvapi、チャンネルは v3_guest から集め、失敗分は failed に入れて部分成功で返す', async () => {
    const calls: string[] = []
    const fetchImpl = makeFetch(calls)
    const result = await fetchOwnerInfo(
      { userIds: ['1', '2', '3'], channelVideoIds: ['so5', 'so9'] },
      { fetchImpl: fetchImpl as unknown as typeof fetch, concurrency: 2 }
    )
    expect(result.users).toEqual({ '1': { name: 'user-1', icon: 'https://i/1.jpg' } })
    expect(result.channels).toEqual({ 'ch-so5': { name: 'channel-so5', icon: 'https://c/so5.jpg' } })
    expect(result.failed.sort()).toEqual(['2', '3', 'so9'])
    expect(calls).toHaveLength(5)
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

  it('TTL を過ぎたキャッシュは使わない', async () => {
    const calls: string[] = []
    const fetchImpl = makeFetch(calls) as unknown as typeof fetch
    await fetchOwnerInfo({ userIds: ['1'], channelVideoIds: [] }, { fetchImpl, now: 0 })
    await fetchOwnerInfo({ userIds: ['1'], channelVideoIds: [] }, { fetchImpl, now: 25 * 60 * 60 * 1000 })
    expect(calls).toHaveLength(2)
  })
})
