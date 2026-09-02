import { describe, it, expect, vi } from 'vitest'
import {
  sanitizeVideoIds,
  parseTagDetails,
  fetchTagDetailsForVideos,
  REALTIME_TAGS_MAX_VIDEOS,
} from '@/lib/search/realtime-tags'

describe('sanitizeVideoIds', () => {
  it('形式不正・重複を除き上限で打ち切る', () => {
    expect(sanitizeVideoIds('sm1, sm2,sm1,bad,so3,nm4,<script>')).toEqual(['sm1', 'sm2', 'so3', 'nm4'])
    const many = Array.from({ length: 50 }, (_, i) => `sm${i + 1}`).join(',')
    expect(sanitizeVideoIds(many)).toHaveLength(REALTIME_TAGS_MAX_VIDEOS)
    expect(sanitizeVideoIds(null)).toEqual([])
  })
})

describe('parseTagDetails', () => {
  it('v3_guest の data.tag.items から name/isLocked を取り出す', () => {
    const payload = { meta: { status: 200 }, data: { tag: { items: [{ name: 'MMD', isLocked: true }, { name: '初音ミク', isLocked: false }, { name: '' }] } } }
    expect(parseTagDetails(payload)).toEqual([{ name: 'MMD', isLocked: true }, { name: '初音ミク', isLocked: false }])
  })
  it('想定外の形は空配列', () => {
    expect(parseTagDetails(null)).toEqual([])
    expect(parseTagDetails({ data: {} })).toEqual([])
  })
})

describe('fetchTagDetailsForVideos', () => {
  it('並列数を絞って取得し、失敗分は failed に入れて部分成功で返す', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      const id = url.match(/v3_guest\/(sm\d+)/)![1]
      if (id === 'sm2') return { ok: false, status: 500 } as unknown as Response
      if (id === 'sm3') throw new Error('network')
      return { ok: true, status: 200, json: async () => ({ data: { tag: { items: [{ name: `tag-${id}`, isLocked: id === 'sm1' }] } } }) } as unknown as Response
    })
    const result = await fetchTagDetailsForVideos(['sm1', 'sm2', 'sm3', 'sm4'], { fetchImpl: fetchImpl as unknown as typeof fetch, concurrency: 2 })
    expect(result.tagDetails).toEqual({ sm1: [{ name: 'tag-sm1', isLocked: true }], sm4: [{ name: 'tag-sm4', isLocked: false }] })
    expect(result.failed.sort()).toEqual(['sm2', 'sm3'])
    expect(calls).toHaveLength(4)
    expect(calls[0]).toContain('_frontendId=6')
  })
})
