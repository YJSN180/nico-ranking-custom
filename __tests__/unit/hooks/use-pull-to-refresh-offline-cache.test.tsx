import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { clearCachesForReload, OFFLINE_CACHE_PREFIX } from '@/hooks/use-pull-to-refresh'

// プルリフレッシュ（PWA）は再読み込みの前にキャッシュを消す。オフラインページのキャッシュ
// （public/sw.js がインストール時にだけ作る）まで消すと、SW が更新されるまで作り直されず、
// 電波の無いときに再読み込みすると「オフラインです」の素の文字だけになる。

describe('プルリフレッシュの再読み込み前のキャッシュ削除', () => {
  const deleted: string[] = []
  const originalCaches = (globalThis as unknown as { caches?: unknown }).caches

  beforeEach(() => {
    deleted.length = 0
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn(async () => ['nr-offline-v1', 'next-data', 'workbox-precache-v2']),
        delete: vi.fn(async (name: string) => {
          deleted.push(name)
          return true
        })
      }
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches })
  })

  it('オフラインページのキャッシュは残し、それ以外を消す', async () => {
    await clearCachesForReload()
    expect(deleted).toEqual(['next-data', 'workbox-precache-v2'])
  })

  it('残す接頭辞は public/sw.js のオフライン用キャッシュ名と一致する', () => {
    const sw = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf-8')
    const name = sw.match(/const OFFLINE_CACHE = '([^']+)'/)?.[1] ?? ''
    expect(name).not.toBe('')
    expect(name.startsWith(OFFLINE_CACHE_PREFIX)).toBe(true)
  })
})
