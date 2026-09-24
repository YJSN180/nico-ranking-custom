import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// KV をキー→値の表でモックする。failing に入れたキーは読み取り失敗（例外）にする
const store = new Map<string, unknown>()
const failing = new Set<string>()
const getStrict = vi.fn(async (key: string, _options?: { attempts?: number }) => {
  if (failing.has(key)) throw new Error(`kv down: ${key}`)
  return store.has(key) ? store.get(key) : null
})
const set = vi.fn(async (key: string, value: unknown) => {
  if (failing.has(`set:${key}`)) throw new Error('KV set failed: 429')
  store.set(key, value)
})
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: async (key: string) => (store.has(key) ? store.get(key) : null),
    getStrict: (key: string, options?: { attempts?: number }) => getStrict(key, options),
    set: (key: string, value: unknown) => set(key, value),
  },
}))

import {
  getLqngConfig,
  getLqngVerdicts,
  invalidateLqngCache,
  loadLqngConfig,
  readLqngConfigStrict,
  readLqngVerdictsStrict,
  resetLqngServerState,
  saveLqngConfig,
} from '@/lib/lqng/server'
import { LQNG_KV_KEYS } from '@/lib/lqng/config'
import { DEFAULT_LQNG_CONFIG } from '@/lib/lqng/types'

// 合成値のみ
const storedConfig = { enabled: true, pollTags: ['t1'], titleNeedles: ['てすとまん'], allowlist: { authorIds: ['9001'], videoIds: [] }, updatedAt: '2026-01-01T00:00:00.000Z' }
const storedVerdicts = { version: 1, authors: { '1001': { status: 'ng', reasons: ['B'], since: 't', evidence: [] } }, videos: {}, updatedAt: 't' }

describe('lib/lqng/server', () => {
  beforeEach(() => {
    store.clear()
    failing.clear()
    getStrict.mockClear()
    set.mockClear()
    resetLqngServerState()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  describe('管理 API 用の strict 読み取り', () => {
    it('未設定（404）は既定値、保存済みは正規化した値を返す', async () => {
      expect(await readLqngConfigStrict()).toEqual(DEFAULT_LQNG_CONFIG)
      store.set(LQNG_KV_KEYS.config, storedConfig)
      const config = await readLqngConfigStrict()
      expect(config.enabled).toBe(true)
      expect(config.allowlist.authorIds).toEqual(['9001'])
      expect(config.updatedAt).toBe('2026-01-01T00:00:00.000Z')
    })

    it('読み取り失敗は既定値にせず例外にする', async () => {
      failing.add(LQNG_KV_KEYS.config)
      failing.add(LQNG_KV_KEYS.verdicts)
      await expect(readLqngConfigStrict()).rejects.toThrow('kv down')
      await expect(readLqngVerdictsStrict()).rejects.toThrow('kv down')
    })
  })

  describe('サイト側の読み取り（getLqngConfig / getLqngVerdicts）', () => {
    it('失敗時は直前の成功値を返す', async () => {
      store.set(LQNG_KV_KEYS.config, storedConfig)
      store.set(LQNG_KV_KEYS.verdicts, storedVerdicts)
      expect((await getLqngConfig()).enabled).toBe(true)
      expect(Object.keys((await getLqngVerdicts()).authors)).toEqual(['1001'])

      failing.add(LQNG_KV_KEYS.config)
      failing.add(LQNG_KV_KEYS.verdicts)
      const config = await getLqngConfig()
      expect(config.enabled).toBe(true)
      expect(config.titleNeedles).toEqual(['てすとまん'])
      expect(Object.keys((await getLqngVerdicts()).authors)).toEqual(['1001'])
    })

    it('直前の成功値があるときは 1 回だけ試して待たせない', async () => {
      store.set(LQNG_KV_KEYS.config, storedConfig)
      await getLqngConfig()
      expect(getStrict).toHaveBeenLastCalledWith(LQNG_KV_KEYS.config, { attempts: undefined })
      await getLqngConfig()
      expect(getStrict).toHaveBeenLastCalledWith(LQNG_KV_KEYS.config, { attempts: 1 })
    })

    it('直前の成功値が無ければ無効扱い（既定値）にするが、失敗をキャッシュしない', async () => {
      vi.stubEnv('NODE_ENV', 'production') // キャッシュを有効にして確かめる
      failing.add(LQNG_KV_KEYS.config)
      const first = await loadLqngConfig()
      expect(first.ok).toBe(false)
      expect(first.value.enabled).toBe(false)

      // 失敗は 60 秒キャッシュされず、次の呼び出しで読み直す
      failing.delete(LQNG_KV_KEYS.config)
      store.set(LQNG_KV_KEYS.config, storedConfig)
      const second = await loadLqngConfig()
      expect(second.ok).toBe(true)
      expect(second.value.enabled).toBe(true)
      expect(getStrict).toHaveBeenCalledTimes(2)
    })

    it('成功値は 60 秒キャッシュし、失敗後は直前の成功値を短い間隔だけ返して KV を叩き続けない', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      store.set(LQNG_KV_KEYS.config, storedConfig)
      expect((await loadLqngConfig()).ok).toBe(true)
      await loadLqngConfig()
      expect(getStrict).toHaveBeenCalledTimes(1) // キャッシュ

      vi.advanceTimersByTime(61_000)
      failing.add(LQNG_KV_KEYS.config)
      const failed = await loadLqngConfig()
      expect(failed).toMatchObject({ ok: false, value: { enabled: true } })
      expect(getStrict).toHaveBeenCalledTimes(2)

      // 再試行間隔の間は KV を読まずに直前の成功値を返す（ok=false のまま）
      vi.advanceTimersByTime(5_000)
      expect(await loadLqngConfig()).toMatchObject({ ok: false, value: { enabled: true } })
      expect(getStrict).toHaveBeenCalledTimes(2)

      // 間隔を過ぎたら読み直し、回復していれば成功値に戻る
      vi.advanceTimersByTime(6_000)
      failing.delete(LQNG_KV_KEYS.config)
      expect((await loadLqngConfig()).ok).toBe(true)
      expect(getStrict).toHaveBeenCalledTimes(3)
    })

    it('invalidateLqngCache は再試行間隔も解除するが、直前の成功値は残す', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      store.set(LQNG_KV_KEYS.config, storedConfig)
      await loadLqngConfig()
      failing.add(LQNG_KV_KEYS.config)
      invalidateLqngCache()
      expect((await loadLqngConfig()).value.enabled).toBe(true)
      invalidateLqngCache()
      await loadLqngConfig()
      expect(getStrict).toHaveBeenCalledTimes(3)
    })
  })

  describe('saveLqngConfig', () => {
    it('updatedAt を更新した保存値を返す', async () => {
      const saved = await saveLqngConfig({ ...DEFAULT_LQNG_CONFIG, enabled: true })
      expect(saved.updatedAt).not.toBe(DEFAULT_LQNG_CONFIG.updatedAt)
      expect(store.get(LQNG_KV_KEYS.config)).toEqual(saved)
    })

    it('KV への書き込みが失敗したら例外を伝える', async () => {
      failing.add(`set:${LQNG_KV_KEYS.config}`)
      await expect(saveLqngConfig({ ...DEFAULT_LQNG_CONFIG })).rejects.toThrow('429')
    })
  })
})
