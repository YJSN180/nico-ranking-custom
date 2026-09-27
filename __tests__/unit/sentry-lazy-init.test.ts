import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ブラウザ側 Sentry の遅延初期化（instrumentation-client.ts / lib/sentry/client.ts）で、
// SDK の初期化までに起きたエラーを取りこぼさないこと。
// SDK（@sentry/nextjs）は load 後のアイドル時、または最初の captureWebException で読み込む。
// それまでの未捕捉エラー / unhandledrejection は 10 件まで溜め、初期化の時点で送る。

interface Gate {
  promise: Promise<void>
  open: () => void
}

function createGate(): Gate {
  let open: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

// SDK の init が入れるグローバルハンドラの代わり（初期化の後のエラーは SDK 自身が拾う）
const sdkHandled: string[] = []
function sdkGlobalHandler(event: ErrorEvent) {
  sdkHandled.push(event.message)
}

const sdk = {
  initialized: false,
  init: vi.fn(() => {
    sdk.initialized = true
    window.addEventListener('error', sdkGlobalHandler)
  }),
  getClient: vi.fn(() => (sdk.initialized ? { on: vi.fn() } : undefined)),
  captureException: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  withScope: vi.fn((callback: (scope: Record<string, () => void>) => void) =>
    callback({ setTag: vi.fn(), setContext: vi.fn(), setExtra: vi.fn(), setFingerprint: vi.fn(), setLevel: vi.fn() })
  ),
}

let gate: Gate
let sdkImports = 0
let failNextImport = false
const idleCallbacks: Array<() => void> = []

beforeEach(() => {
  vi.resetModules()
  sdk.initialized = false
  sdk.init.mockClear()
  sdk.getClient.mockClear()
  sdk.captureException.mockClear()
  sdk.captureRouterTransitionStart.mockClear()
  gate = createGate()
  sdkImports = 0
  failNextImport = false
  idleCallbacks.length = 0
  sdkHandled.length = 0

  // SDK（約150KB のチャンク）の到着をテストから制御する。読み込み失敗も起こせる
  const currentGate = gate
  vi.doMock('@sentry/nextjs', async () => {
    sdkImports += 1
    await currentGate.promise
    if (failNextImport) {
      failNextImport = false
      throw new Error('ChunkLoadError: Loading chunk failed')
    }
    return sdk
  })

  // load 後のアイドル時の開始を、テストから呼べるようにする
  window.requestIdleCallback = ((callback: IdleRequestCallback) => {
    idleCallbacks.push(() => callback({ didTimeout: false, timeRemaining: () => 50 }))
    return idleCallbacks.length
  }) as typeof window.requestIdleCallback
})

afterEach(() => {
  Reflect.deleteProperty(window, 'requestIdleCallback')
  window.removeEventListener('error', sdkGlobalHandler)
})

async function loadInstrumentation() {
  return import('@/instrumentation-client')
}

function runIdleStart() {
  for (const callback of idleCallbacks.splice(0)) callback()
}

async function settle() {
  await vi.dynamicImportSettled()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function dispatchError(message: string) {
  const error = new Error(message)
  window.dispatchEvent(new ErrorEvent('error', { error, message }))
}

function capturedMessages(): string[] {
  return sdk.captureException.mock.calls.map(([error]) => (error as Error).message)
}

describe('Sentry の遅延初期化: エラーを取りこぼさない', () => {
  it('初期化の前に起きたエラーは、初期化の後に送る', async () => {
    await loadInstrumentation()
    dispatchError('before-start')
    runIdleStart()
    gate.open()
    await settle()

    expect(sdk.init).toHaveBeenCalledTimes(1)
    expect(capturedMessages()).toEqual(['before-start'])
  })

  it('SDK の取得中（開始してから初期化されるまで）に起きたエラーも送る', async () => {
    await loadInstrumentation()
    runIdleStart()
    dispatchError('while-loading')
    gate.open()
    await settle()

    expect(capturedMessages()).toEqual(['while-loading'])
  })

  it('captureWebException が先に SDK を読み込んだら、その時点で溜めたエラーを送り、以後は溜めない', async () => {
    await loadInstrumentation()
    dispatchError('buffered')
    const { captureWebException } = await import('@/lib/sentry/capture')
    gate.open()
    await captureWebException(new Error('reported'))

    expect(capturedMessages()).toEqual(['buffered', 'reported'])

    // 初期化の後のエラーは SDK 自身のハンドラが拾う。バッファからは二重に送らない
    dispatchError('after-init')
    runIdleStart()
    await settle()
    expect(sdkHandled).toEqual(['after-init'])
    expect(capturedMessages()).toEqual(['buffered', 'reported'])
  })

  it('SDK の読み込みに失敗しても溜めたエラーは残し、次の呼び出しで読み直して送る', async () => {
    failNextImport = true
    await loadInstrumentation()
    dispatchError('early')
    runIdleStart()
    gate.open()
    await settle()
    expect(sdk.init).not.toHaveBeenCalled()

    const { captureWebException } = await import('@/lib/sentry/capture')
    await captureWebException(new Error('later'))

    expect(sdkImports).toBe(2)
    expect(capturedMessages()).toEqual(['early', 'later'])
  })

  it('SDK の読み込みに失敗しても、未処理の Promise 拒否を出さない（開始時・遷移時）', async () => {
    const rejections: unknown[] = []
    const onRejection = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', onRejection)
    try {
      failNextImport = true
      const { onRouterTransitionStart } = await loadInstrumentation()
      runIdleStart()
      gate.open()
      await settle()

      failNextImport = true
      onRouterTransitionStart('/search', 'push')
      await settle()
      await new Promise((resolve) => setTimeout(resolve, 10))
    } finally {
      process.off('unhandledRejection', onRejection)
    }
    expect(rejections).toEqual([])
  })

  it('溜めるのは 10 件まで', async () => {
    await loadInstrumentation()
    for (let i = 0; i < 12; i++) dispatchError(`early-${i}`)
    runIdleStart()
    gate.open()
    await settle()

    expect(capturedMessages()).toHaveLength(10)
  })
})

describe('Sentry の遅延初期化: App Router の遷移（onRouterTransitionStart）', () => {
  it('SDK の読み込みがまだ何も始まっていなければ、遷移のために読み込まない', async () => {
    const { onRouterTransitionStart } = await loadInstrumentation()
    gate.open()
    onRouterTransitionStart('/search', 'push')
    await settle()

    expect(sdkImports).toBe(0)
    expect(sdk.captureRouterTransitionStart).not.toHaveBeenCalled()
  })

  it('captureWebException が先に読み込んでいれば、アイドル時の開始より前でも遷移を渡す', async () => {
    const { onRouterTransitionStart } = await loadInstrumentation()
    const { captureWebException } = await import('@/lib/sentry/capture')
    gate.open()
    await captureWebException(new Error('reported'))

    onRouterTransitionStart('/search', 'push')
    await settle()

    expect(sdk.captureRouterTransitionStart).toHaveBeenCalledWith('/search', 'push')
  })

  it('アイドル時に開始した後の遷移は渡す', async () => {
    const { onRouterTransitionStart } = await loadInstrumentation()
    runIdleStart()
    gate.open()
    await settle()

    onRouterTransitionStart('/mylists', 'push')
    await settle()

    expect(sdk.captureRouterTransitionStart).toHaveBeenCalledWith('/mylists', 'push')
  })
})
