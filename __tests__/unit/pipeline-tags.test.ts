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
  })
})
