import { describe, it, expect, vi } from 'vitest'
import { MYLIST_SORT_OPTIONS, updateMylistSort, restoreSavedSortOrder } from '@/app/mylists/utils/sort-helpers'
import type { MylistSortOrder } from '@/lib/storage/types'

describe('Mylist sort helpers', () => {
  it('provides expected sort options', () => {
    const labels = MYLIST_SORT_OPTIONS.map(option => option.label)
    expect(labels).toEqual([
      '更新日（新しい順）',
      '更新日（古い順）',
      '作成日（新しい順）',
      '作成日（古い順）',
      '名前（昇順）',
      '名前（降順）',
      '動画数（多い順）',
      '動画数（少ない順）'
    ])
  })

  it('updates sort order and persists configuration', async () => {
    const setSortOrder = vi.fn()
    const saveMylistSortConfig = vi.fn().mockResolvedValue(undefined)
    const loadMylists = vi.fn().mockResolvedValue(undefined)

    await updateMylistSort({
      newSortOrder: 'name-asc',
      setSortOrder,
      mylistManager: { saveMylistSortConfig },
      loadMylists
    })

    expect(setSortOrder).toHaveBeenCalledWith('name-asc')
    expect(saveMylistSortConfig).toHaveBeenCalledWith({ order: 'name-asc' })
    expect(loadMylists).toHaveBeenCalledWith('name-asc')
  })

  it('continues even when persisting sort order fails', async () => {
    const setSortOrder = vi.fn()
    const saveMylistSortConfig = vi.fn().mockRejectedValue(new Error('failed'))
    const loadMylists = vi.fn().mockResolvedValue(undefined)
    const logger = vi.fn()

    await updateMylistSort({
      newSortOrder: 'videoCount-desc',
      setSortOrder,
      mylistManager: { saveMylistSortConfig },
      loadMylists,
      logger
    })

    expect(setSortOrder).toHaveBeenCalledWith('videoCount-desc')
    expect(loadMylists).toHaveBeenCalledWith('videoCount-desc')
    expect(logger).toHaveBeenCalledWith('Failed to update sort order:', expect.any(Error))
  })

  it('restores saved sort order when available', async () => {
    const setSortOrder = vi.fn()
    const loadMylists = vi.fn().mockResolvedValue(undefined)
    const getMylistSortConfig = vi.fn().mockResolvedValue({ order: 'name-desc', lastUpdated: Date.now() })

    await restoreSavedSortOrder({
      mylistManager: { getMylistSortConfig },
      setSortOrder,
      loadMylists,
      fallbackOrder: 'createdAt-desc'
    })

    expect(setSortOrder).toHaveBeenCalledWith('name-desc')
    expect(loadMylists).toHaveBeenCalledWith('name-desc')
  })

  it('uses fallback order when saved config retrieval fails', async () => {
    const setSortOrder = vi.fn()
    const loadMylists = vi.fn().mockResolvedValue(undefined)
    const getMylistSortConfig = vi.fn().mockRejectedValue(new Error('load failed'))
    const logger = vi.fn()
    const fallback: MylistSortOrder = 'createdAt-desc'

    await restoreSavedSortOrder({
      mylistManager: { getMylistSortConfig },
      setSortOrder,
      loadMylists,
      fallbackOrder: fallback,
      logger
    })

    expect(setSortOrder).toHaveBeenCalledWith(fallback)
    expect(loadMylists).toHaveBeenCalledWith(fallback)
    expect(logger).toHaveBeenCalledWith('Failed to load mylist sort config:', expect.any(Error))
  })
})
