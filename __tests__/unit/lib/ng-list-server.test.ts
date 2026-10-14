import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getServerNGList,
  getAdminNGList,
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
    getStrict: vi.fn(),
    set: vi.fn()
  }
}))

import { kv } from '@/lib/simple-kv'

// キーごとの値を返す getStrict の実装（ほかのキーは未設定＝null）
const strictFrom = (values: Record<string, unknown>) => async (key: string): Promise<unknown> => (key in values ? values[key] : null)

describe('NG List Server Functions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
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

      vi.mocked(kv.get)
        .mockResolvedValueOnce(mockManual)
        .mockResolvedValueOnce(mockDerived)

      const result = await getServerNGList()

      expect(result).toEqual({
        videoIds: ['sm123'],
        videoTitles: {
          exact: ['Test Video'],
          partial: []
        },
        authorIds: ['author1'],
        authorNames: {
          exact: ['Test Author'],
          partial: []
        },
        derivedVideoIds: ['sm456', 'sm789']
      })
    })

    it('should return empty lists on error', async () => {
      vi.mocked(kv.get).mockRejectedValue(new Error('KV error'))

      const result = await getServerNGList()

      expect(result).toEqual({
        videoIds: [],
        videoTitles: {
          exact: [],
          partial: []
        },
        authorIds: [],
        authorNames: {
          exact: [],
          partial: []
        },
        derivedVideoIds: []
      })
    })
  })

  describe('getAdminNGList（管理画面用）', () => {
    it('手動の 4 項目と派生NGを返す（保存済みレコードの余分な欄は返さない）', async () => {
      vi.mocked(kv.getStrict).mockImplementation(strictFrom({
        'ng-list-manual': { videoIds: ['sm1'], videoTitles: { exact: ['t'], partial: [] }, authorIds: [], authorNames: { exact: [], partial: [] }, extra: ['x'] },
        'ng-list-derived': ['sm2']
      }))
      expect(await getAdminNGList()).toEqual({ videoIds: ['sm1'], videoTitles: { exact: ['t'], partial: [] }, authorIds: [], authorNames: { exact: [], partial: [] }, derivedVideoIds: ['sm2'] })
      expect(kv.get).not.toHaveBeenCalled()
    })

    it('未設定（404）は空の一覧', async () => {
      vi.mocked(kv.getStrict).mockResolvedValue(null)
      expect(await getAdminNGList()).toEqual({ videoIds: [], videoTitles: { exact: [], partial: [] }, authorIds: [], authorNames: { exact: [], partial: [] }, derivedVideoIds: [] })
    })

    it('読み取り失敗は空の一覧にせず例外にする', async () => {
      vi.mocked(kv.getStrict).mockRejectedValue(new Error('KV get failed: 429'))
      await expect(getAdminNGList()).rejects.toThrow('429')
    })
  })

  describe('addToServerDerivedNGList', () => {
    it('should add new video IDs to derived list without duplicates', async () => {
      const existingIds = ['sm123', 'sm456']
      const newIds = ['sm456', 'sm789', 'sm101112']

      vi.mocked(kv.getStrict).mockResolvedValueOnce(existingIds)
      vi.mocked(kv.set).mockResolvedValueOnce(undefined)

      await addToServerDerivedNGList(newIds)

      expect(kv.set).toHaveBeenCalledWith(
        'ng-list-derived',
        ['sm123', 'sm456', 'sm789', 'sm101112']
      )
    })

    it('should handle empty existing list', async () => {
      vi.mocked(kv.getStrict).mockResolvedValueOnce(null)
      vi.mocked(kv.set).mockResolvedValueOnce(undefined)

      await addToServerDerivedNGList(['sm123', 'sm456'])

      expect(kv.set).toHaveBeenCalledWith(
        'ng-list-derived',
        ['sm123', 'sm456']
      )
    })

    it('should skip if no video IDs provided', async () => {
      await addToServerDerivedNGList([])

      expect(kv.get).not.toHaveBeenCalled()
      expect(kv.getStrict).not.toHaveBeenCalled()
      expect(kv.set).not.toHaveBeenCalled()
    })

    it('派生NGを読めなければ、追加分だけで上書きせずに例外にする', async () => {
      vi.mocked(kv.getStrict).mockRejectedValueOnce(new Error('KV get failed: 503'))

      await expect(addToServerDerivedNGList(['sm1'])).rejects.toThrow('503')
      expect(kv.set).not.toHaveBeenCalled()
    })
  })

  describe('clearServerDerivedNGList', () => {
    it('should clear the derived NG list', async () => {
      vi.mocked(kv.set).mockResolvedValueOnce(undefined)

      await clearServerDerivedNGList()

      expect(kv.set).toHaveBeenCalledWith('ng-list-derived', [])
    })

    it('should throw error on failure', async () => {
      vi.mocked(kv.set).mockRejectedValueOnce(new Error('KV error'))

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

      vi.mocked(kv.get).mockResolvedValueOnce(mockManual)

      const result = await getNGListManual()

      expect(result).toEqual({
        videoIds: ['sm123'],
        videoTitles: {
          exact: ['Test Video'],
          partial: []
        },
        authorIds: ['author1'],
        authorNames: {
          exact: ['Test Author'],
          partial: []
        }
      })
    })

    it('should return empty list on error', async () => {
      vi.mocked(kv.get).mockRejectedValueOnce(new Error('KV error'))

      const result = await getNGListManual()

      expect(result).toEqual({
        videoIds: [],
        videoTitles: {
          exact: [],
          partial: []
        },
        authorIds: [],
        authorNames: {
          exact: [],
          partial: []
        }
      })
    })
  })

  describe('setNGListManual', () => {
    it('should save manual NG list', async () => {
      const ngList = {
        videoIds: ['sm123'],
        videoTitles: {
          exact: ['Test Video'],
          partial: []
        },
        authorIds: ['author1'],
        authorNames: {
          exact: ['Test Author'],
          partial: []
        }
      }

      vi.mocked(kv.set).mockResolvedValueOnce(undefined)

      await setNGListManual(ngList)

      expect(kv.set).toHaveBeenCalledWith('ng-list-manual', ngList)
    })
  })

  describe('getServerDerivedNGList', () => {
    it('should return derived NG list', async () => {
      const mockDerived = ['sm123', 'sm456']

      vi.mocked(kv.get).mockResolvedValueOnce(mockDerived)

      const result = await getServerDerivedNGList()

      expect(result).toEqual(mockDerived)
    })

    it('should return empty array on error', async () => {
      vi.mocked(kv.get).mockRejectedValueOnce(new Error('KV error'))

      const result = await getServerDerivedNGList()

      expect(result).toEqual([])
    })
  })
})