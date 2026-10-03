// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { read } = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('../../scripts/lib/r2-store', () => ({
  createR2Store: () => ({ read }),
}))
import { getExistingTagsFromR2 } from '../../scripts/accumulate-tags'

beforeEach(() => read.mockReset())
describe('cumulative tags', () => {
  it('loads existing tags through the authenticated gzip-aware store', async () => {
    const data = {
      tags: ['kept'],
      metadata: { version: 5, weeklyUpdateCount: 5 },
    }
    read.mockResolvedValue({ data })
    expect(await getExistingTagsFromR2()).toEqual(data)
    expect(read).toHaveBeenCalledWith('tag-accumulation.json')
  })
  it('initializes only on a confirmed missing object', async () => {
    read.mockResolvedValue(null)
    expect((await getExistingTagsFromR2()).tags).toEqual([])
  })
  it('does not replace unavailable or malformed accumulated data with an empty list', async () => {
    read.mockRejectedValueOnce(new Error('R2 500'))
    await expect(getExistingTagsFromR2()).rejects.toThrow('R2 500')
    read.mockResolvedValue({ data: { tags: [null] } })
    await expect(getExistingTagsFromR2()).rejects.toThrow('Invalid existing')
    // lastSeen が揃っていても、タグが壊れていれば拒否する
    read.mockResolvedValue({
      data: { tags: ['ok', 3], lastSeen: { day: 20364, ages: '00' }, metadata: { version: 1, weeklyUpdateCount: 1 } },
    })
    await expect(getExistingTagsFromR2()).rejects.toThrow('Invalid existing')
  })
  it('decodes aligned lastSeen into days', async () => {
    read.mockResolvedValue({
      data: { tags: ['a', 'b', 'c'], lastSeen: { day: 20364, ages: '04t' }, metadata: { version: 5, weeklyUpdateCount: 5 } },
    })
    expect(await getExistingTagsFromR2()).toEqual({
      tags: ['a', 'b', 'c'],
      lastSeenDays: [20364, 20360, 20335],
      metadata: { version: 5, weeklyUpdateCount: 5 },
    })
  })
  it('treats missing or misaligned lastSeen as legacy and logs no tag contents', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: unknown[] = [
      undefined,
      'bad',
      { day: 20364, ages: '0' },
      { day: 20364, ages: '0-' },
      { day: 20364, ages: '0A' },
      { day: 20364.5, ages: '00' },
      { day: '20364', ages: '00' },
      { day: 20364, ages: [0, 0] },
      { ages: '00' },
    ]
    try {
      for (const lastSeen of broken) {
        read.mockResolvedValue({
          data: { tags: ['秘密のタグ', '別のタグ'], lastSeen, metadata: { version: 5, weeklyUpdateCount: 5 } },
        })
        const result = await getExistingTagsFromR2()
        expect(result.tags).toEqual(['秘密のタグ', '別のタグ'])
        expect(result.lastSeenDays).toBeUndefined()
      }
      expect(warn).toHaveBeenCalledTimes(broken.length)
      for (const call of warn.mock.calls) {
        expect(call.join(' ')).toMatch(/legacy/)
        expect(call.join(' ')).not.toMatch(/秘密のタグ|別のタグ/)
      }
    } finally {
      warn.mockRestore()
    }
  })
})
