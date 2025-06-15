import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getServerNGList,
  saveServerManualNGList,
  addToServerDerivedNGList,
  getNGListManual,
  setNGListManual,
  getServerDerivedNGList,
  clearServerDerivedNGList
} from '@/lib/ng-list-server'

// Mock the KV module
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn()
  }
}))

import { kv } from '@/lib/simple-kv'

describe('NG List Server Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getServerNGList', () => {
    it('should return combined manual and derived NG lists', async () => {
      const mockManual = {
        videoIds: ['sm123'],
        videoTitles: ['Test Video'],
        authorIds: ['author1'],
        authorNames: ['Test Author']
      }
      const mockDerived = ['sm456', 'sm789']

      ;(kv.get as any)
        .mockResolvedValueOnce(mockManual)
        .mockResolvedValueOnce(mockDerived)

      const result = await getServerNGList()

      expect(result).toEqual({
        videoIds: ['sm123'],
        videoTitles: ['Test Video'],
        authorIds: ['author1'],
        authorNames: ['Test Author'],
        derivedVideoIds: ['sm456', 'sm789']
      })
    })

    it('should return empty lists on error', async () => {
      ;(kv.get as any).mockRejectedValue(new Error('KV error'))

      const result = await getServerNGList()

      expect(result).toEqual({
        videoIds: [],
        videoTitles: [],
        authorIds: [],
        authorNames: [],
        derivedVideoIds: []
      })
    })
  })

  describe('addToServerDerivedNGList', () => {
    it('should add new video IDs to derived list without duplicates', async () => {
      const existingIds = ['sm123', 'sm456']
      const newIds = ['sm456', 'sm789', 'sm101112']

      ;(kv.get as any).mockResolvedValueOnce(existingIds)
      ;(kv.set as any).mockResolvedValueOnce(undefined)

      await addToServerDerivedNGList(newIds)

      expect(kv.set).toHaveBeenCalledWith(
        'ng-list-derived',
        ['sm123', 'sm456', 'sm789', 'sm101112']
      )
    })

    it('should handle empty existing list', async () => {
      ;(kv.get as any).mockResolvedValueOnce(null)
      ;(kv.set as any).mockResolvedValueOnce(undefined)

      await addToServerDerivedNGList(['sm123', 'sm456'])

      expect(kv.set).toHaveBeenCalledWith(
        'ng-list-derived',
        ['sm123', 'sm456']
      )
    })

    it('should skip if no video IDs provided', async () => {
      await addToServerDerivedNGList([])

      expect(kv.get).not.toHaveBeenCalled()
      expect(kv.set).not.toHaveBeenCalled()
    })
  })

  describe('clearServerDerivedNGList', () => {
    it('should clear the derived NG list', async () => {
      ;(kv.set as any).mockResolvedValueOnce(undefined)

      await clearServerDerivedNGList()

      expect(kv.set).toHaveBeenCalledWith('ng-list-derived', [])
    })

    it('should throw error on failure', async () => {
      ;(kv.set as any).mockRejectedValueOnce(new Error('KV error'))

      await expect(clearServerDerivedNGList()).rejects.toThrow('KV error')
    })
  })

  describe('getNGListManual', () => {
    it('should return manual NG list', async () => {
      const mockManual = {
        videoIds: ['sm123'],
        videoTitles: ['Test Video'],
        authorIds: ['author1'],
        authorNames: ['Test Author']
      }

      ;(kv.get as any).mockResolvedValueOnce(mockManual)

      const result = await getNGListManual()

      expect(result).toEqual(mockManual)
    })

    it('should return empty list on error', async () => {
      ;(kv.get as any).mockRejectedValueOnce(new Error('KV error'))

      const result = await getNGListManual()

      expect(result).toEqual({
        videoIds: [],
        videoTitles: [],
        authorIds: [],
        authorNames: []
      })
    })
  })

  describe('setNGListManual', () => {
    it('should save manual NG list', async () => {
      const ngList = {
        videoIds: ['sm123'],
        videoTitles: ['Test Video'],
        authorIds: ['author1'],
        authorNames: ['Test Author']
      }

      ;(kv.set as any).mockResolvedValueOnce(undefined)

      await setNGListManual(ngList)

      expect(kv.set).toHaveBeenCalledWith('ng-list-manual', ngList)
    })
  })

  describe('getServerDerivedNGList', () => {
    it('should return derived NG list', async () => {
      const mockDerived = ['sm123', 'sm456']

      ;(kv.get as any).mockResolvedValueOnce(mockDerived)

      const result = await getServerDerivedNGList()

      expect(result).toEqual(mockDerived)
    })

    it('should return empty array on error', async () => {
      ;(kv.get as any).mockRejectedValueOnce(new Error('KV error'))

      const result = await getServerDerivedNGList()

      expect(result).toEqual([])
    })
  })
})