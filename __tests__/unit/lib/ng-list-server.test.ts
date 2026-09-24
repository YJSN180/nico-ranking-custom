import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getServerNGList,
  getAdminNGList,
  resetServerNGListState,
  saveServerManualNGList,
  addToServerDerivedNGList,
  getNGListManual,
  setNGListManual,
  getServerDerivedNGList,
  clearServerDerivedNGList
} from '@/lib/ng-list-server'
import { resetLqngServerState } from '@/lib/lqng/server'

// Mock the KV module
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn(),
    getStrict: vi.fn(),
    set: vi.fn()
  }
}))

import { kv } from '@/lib/simple-kv'

// キーごとの値を返す getStrict の実装（lqng のキーは未設定＝null）
const strictFrom = (values: Record<string, unknown>) => async (key: string) => (key in values ? values[key] : null)

describe('NG List Server Functions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resetServerNGListState()
    resetLqngServerState()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
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

      vi.mocked(kv.getStrict).mockImplementation(strictFrom({ 'ng-list-manual': mockManual, 'ng-list-derived': mockDerived }))

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
      vi.mocked(kv.getStrict).mockRejectedValue(new Error('KV error'))

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

  describe('getServerNGList の読み取り失敗', () => {
    const manual = { videoIds: ['sm1'], videoTitles: { exact: [], partial: [] }, authorIds: ['7'], authorNames: { exact: [], partial: [] } }

    it('失敗時は直前の成功値を返す', async () => {
      vi.mocked(kv.getStrict).mockImplementation(strictFrom({ 'ng-list-manual': manual, 'ng-list-derived': ['sm9'] }))
      expect((await getServerNGList()).authorIds).toEqual(['7'])

      vi.mocked(kv.getStrict).mockRejectedValue(new Error('KV get failed: 429'))
      const result = await getServerNGList()
      expect(result.authorIds).toEqual(['7'])
      expect(result.derivedVideoIds).toEqual(['sm9'])
    })

    it('サイト側の読み取りは 1 回だけ試す（再試行の待ちをリクエストに乗せない）', async () => {
      vi.mocked(kv.getStrict).mockImplementation(strictFrom({ 'ng-list-manual': manual, 'ng-list-derived': [] }))
      await getServerNGList()
      const manualCalls = vi.mocked(kv.getStrict).mock.calls.filter(([key]) => key === 'ng-list-manual' || key === 'ng-list-derived')
      expect(manualCalls).toHaveLength(2)
      for (const [, options] of manualCalls) expect(options).toEqual({ attempts: 1 })
    })

    it('直前の成功値が無い失敗でも、10 秒は空の一覧を返して KV を読まず、そのあと読み直す', async () => {
      vi.stubEnv('NODE_ENV', 'production') // キャッシュを有効にして確かめる
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      vi.mocked(kv.getStrict).mockRejectedValue(new Error('KV get failed: 503'))
      expect((await getServerNGList()).authorIds).toEqual([])
      const readsAfterFailure = vi.mocked(kv.getStrict).mock.calls.length

      // 障害中はリクエストのたびに KV を読まない
      vi.advanceTimersByTime(5_000)
      expect((await getServerNGList()).authorIds).toEqual([])
      expect(vi.mocked(kv.getStrict).mock.calls.length).toBe(readsAfterFailure)

      // 間隔を過ぎたら読み直し、回復していれば正しい一覧に戻る
      vi.advanceTimersByTime(6_000)
      vi.mocked(kv.getStrict).mockImplementation(strictFrom({ 'ng-list-manual': manual, 'ng-list-derived': [] }))
      expect((await getServerNGList()).authorIds).toEqual(['7'])
    })

    it('自動NG（lqng）だけが失敗したときは、合流した一覧を 10 秒だけキャッシュする', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      vi.mocked(kv.getStrict).mockImplementation(async (key: string) => {
        if (key === 'lqng:config') throw new Error('KV get failed: 503')
        return strictFrom({ 'ng-list-manual': manual, 'ng-list-derived': [] })(key)
      })
      const manualReads = () => vi.mocked(kv.getStrict).mock.calls.filter(([key]) => key === 'ng-list-manual').length
      expect((await getServerNGList()).authorIds).toEqual(['7'])
      expect(manualReads()).toBe(1)
      vi.advanceTimersByTime(5_000)
      expect((await getServerNGList()).authorIds).toEqual(['7'])
      expect(manualReads()).toBe(1)
      // 60 秒は持たない（自動NG が回復したら早めに合流し直す）
      vi.advanceTimersByTime(6_000)
      await getServerNGList()
      expect(manualReads()).toBe(2)
    })

    it('期限（signal）と 1 回のタイムアウトを、手動・派生・自動NG の読み取りすべてに渡す', async () => {
      vi.mocked(kv.getStrict).mockImplementation(strictFrom({ 'ng-list-manual': manual, 'ng-list-derived': [] }))
      const deadline = new AbortController()
      await getServerNGList({ signal: deadline.signal, timeoutMs: 3000 })
      const keys = vi.mocked(kv.getStrict).mock.calls.map(([key, options]) => [key, options?.signal === deadline.signal, options?.timeoutMs])
      expect(keys).toEqual(
        expect.arrayContaining([
          ['ng-list-manual', true, 3000],
          ['ng-list-derived', true, 3000],
          ['lqng:config', true, 3000],
          ['lqng:verdicts', true, 3000],
        ])
      )
    })

    it('手動リストに紛れた自動NGの欄は手動として扱わない', async () => {
      vi.mocked(kv.getStrict).mockImplementation(strictFrom({ 'ng-list-manual': { ...manual, autoAuthorIds: ['1001'], autoVideoIds: ['sm-auto'] }, 'ng-list-derived': [] }))
      const result = await getServerNGList()
      expect(result).not.toHaveProperty('autoAuthorIds')
      expect(result).not.toHaveProperty('autoVideoIds')
    })
  })

  describe('getAdminNGList（管理画面用）', () => {
    it('キャッシュを通さずに手動の 4 項目と派生NGを返す', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.mocked(kv.getStrict).mockImplementation(strictFrom({ 'ng-list-manual': { videoIds: ['sm1'], videoTitles: { exact: ['t'], partial: [] }, authorIds: [], authorNames: { exact: [], partial: [] }, autoAuthorIds: ['1001'] }, 'ng-list-derived': ['sm2'] }))
      const first = await getAdminNGList()
      expect(first).toEqual({ videoIds: ['sm1'], videoTitles: { exact: ['t'], partial: [] }, authorIds: [], authorNames: { exact: [], partial: [] }, derivedVideoIds: ['sm2'] })
      await getAdminNGList()
      expect(vi.mocked(kv.getStrict)).toHaveBeenCalledTimes(4)
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
      ;(kv.set as any).mockResolvedValueOnce(undefined)

      await addToServerDerivedNGList(newIds)

      expect(kv.set).toHaveBeenCalledWith(
        'ng-list-derived',
        ['sm123', 'sm456', 'sm789', 'sm101112']
      )
    })

    it('should handle empty existing list', async () => {
      vi.mocked(kv.getStrict).mockResolvedValueOnce(null)
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
      ;(kv.get as any).mockRejectedValueOnce(new Error('KV error'))

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