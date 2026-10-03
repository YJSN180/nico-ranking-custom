import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

// public/sw.js（ページ遷移だけを扱う最小の Service Worker）の振る舞い。
// ページ遷移を横取りする SW は、navigation preload が無いと SW の起動を待ってから
// 通信を始めるため、遷移のたびに起動時間ぶん遅れる。

const SW_SOURCE = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf-8')

type Listener = (event: FakeEvent) => void

interface FakeEvent {
  request?: { mode: string; url: string }
  preloadResponse?: Promise<Response | undefined>
  respondWith: (response: Promise<Response> | Response) => void
  waitUntil: (promise: Promise<unknown>) => void
}

function loadServiceWorker({
  navigationPreload = true,
  fetchImpl = vi.fn(async () => new Response('network')),
  cachedOffline = new Response('offline page') as Response | undefined,
}: {
  navigationPreload?: boolean
  fetchImpl?: ReturnType<typeof vi.fn>
  cachedOffline?: Response | undefined
} = {}) {
  const listeners: Record<string, Listener> = {}
  const enable = vi.fn(async () => undefined)
  const self = {
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
    registration: navigationPreload ? { navigationPreload: { enable } } : {},
  }
  const caches = {
    open: vi.fn(async () => ({ add: vi.fn(async () => undefined) })),
    keys: vi.fn(async () => ['nr-offline-v1', 'legacy-cache']),
    delete: vi.fn(async () => true),
    match: vi.fn(async () => cachedOffline),
  }
  new Function('self', 'caches', 'fetch', 'Response', SW_SOURCE)(self, caches, fetchImpl, Response)
  return { listeners, enable, caches, fetchImpl, self }
}

function dispatch(listener: Listener, init: Partial<FakeEvent>) {
  let responded: Promise<Response> | Response | undefined
  const pending: Promise<unknown>[] = []
  listener({
    respondWith: (response) => {
      responded = response
    },
    waitUntil: (promise) => {
      pending.push(promise)
    },
    ...init,
  })
  return {
    response: responded === undefined ? undefined : Promise.resolve(responded),
    settled: Promise.all(pending),
  }
}

const navigation = { mode: 'navigate', url: 'https://nico-rank.com/' }

describe('Service Worker: navigation preload', () => {
  it('有効化（activate）で navigation preload を有効にする', async () => {
    const sw = loadServiceWorker()
    await dispatch(sw.listeners.activate, {}).settled
    expect(sw.enable).toHaveBeenCalledTimes(1)
    expect(sw.self.clients.claim).toHaveBeenCalled()
  })

  it('navigation preload の無いブラウザでも有効化は失敗しない', async () => {
    const sw = loadServiceWorker({ navigationPreload: false })
    await expect(dispatch(sw.listeners.activate, {}).settled).resolves.toBeDefined()
    expect(sw.self.clients.claim).toHaveBeenCalled()
  })

  it('ページ遷移では先読み済みの応答を使い、もう一度は取得しない', async () => {
    const sw = loadServiceWorker()
    const preloaded = new Response('preloaded')
    const { response } = dispatch(sw.listeners.fetch, {
      request: navigation,
      preloadResponse: Promise.resolve(preloaded),
    })
    expect(await response).toBe(preloaded)
    expect(sw.fetchImpl).not.toHaveBeenCalled()
  })

  it('先読みが無いとき（未対応・未有効）はネットワークから取得する', async () => {
    const sw = loadServiceWorker()
    const { response } = dispatch(sw.listeners.fetch, {
      request: navigation,
      preloadResponse: Promise.resolve(undefined),
    })
    expect(await (await response)!.text()).toBe('network')
    expect(sw.fetchImpl).toHaveBeenCalledWith(navigation)
  })

  it('オフライン（先読みも取得も失敗）ではオフラインページを返す', async () => {
    const sw = loadServiceWorker({
      fetchImpl: vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    })
    const failedPreload = Promise.reject(new TypeError('Failed to fetch'))
    failedPreload.catch(() => undefined)
    const { response } = dispatch(sw.listeners.fetch, {
      request: navigation,
      preloadResponse: failedPreload,
    })
    expect(await (await response)!.text()).toBe('offline page')
  })

  it('ページ遷移以外（API・画像など）には介入しない', () => {
    const sw = loadServiceWorker()
    const { response } = dispatch(sw.listeners.fetch, {
      request: { mode: 'cors', url: 'https://nico-rank.com/api/ranking' },
    })
    expect(response).toBeUndefined()
  })
})
