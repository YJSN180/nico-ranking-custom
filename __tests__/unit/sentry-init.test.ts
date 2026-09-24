import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { initMock, clientOnMock } = vi.hoisted(() => ({ initMock: vi.fn(), clientOnMock: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({
  init: initMock,
  // 初期化の前は未作成（ブラウザの遅延ローダーは二重初期化を避けるためにこれを見る）
  getClient: () => (initMock.mock.calls.length > 0 ? { on: clientOnMock } : undefined),
  browserTracingIntegration: vi.fn((options: unknown) => ({ name: 'BrowserTracing', options })),
  captureRouterTransitionStart: vi.fn(),
}))

type InitOptions = {
  dsn?: string
  enabled?: boolean
  environment?: string
  beforeSend?: (event: unknown, hint: unknown) => unknown
  beforeSendTransaction?: (event: unknown, hint: unknown) => unknown
  beforeSendSpan?: (span: unknown) => unknown
  beforeBreadcrumb?: (breadcrumb: unknown, hint?: unknown) => unknown
}

const CONFIGS = [
  // ブラウザは instrumentation-client.ts が読み込み後に遅延ローダー経由で初期化する
  {
    name: 'lib/sentry/client (browser)',
    runtime: 'browser',
    load: () => import('@/lib/sentry/client').then((loader) => loader.loadSentryClient()),
  },
  { name: 'sentry.server.config', runtime: 'server', load: () => import('@/sentry.server.config') },
  { name: 'sentry.edge.config', runtime: 'server', load: () => import('@/sentry.edge.config') },
] as const

const DSN = 'https://public@o1.ingest.us.sentry.io/1'
const MARKER = 'zzleakcheck'

function stubSentryEnv(vars: Record<string, string | undefined>) {
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', undefined)
  vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', undefined)
  vi.stubEnv('NEXT_PUBLIC_SENTRY_FORCE_ENABLE', undefined)
  vi.stubEnv('VERCEL_ENV', undefined)
  for (const [key, value] of Object.entries(vars)) {
    vi.stubEnv(key, value)
  }
}

async function loadInitOptions(load: () => Promise<unknown>): Promise<InitOptions> {
  vi.resetModules()
  initMock.mockClear()
  clientOnMock.mockClear()
  await load()
  expect(initMock).toHaveBeenCalledTimes(1)
  return initMock.mock.calls[0][0] as InitOptions
}

describe('Sentry init options', () => {
  beforeEach(() => {
    stubSentryEnv({})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe.each(CONFIGS)('$name', ({ runtime, load }) => {
    it('passes the scrub hooks to init', async () => {
      stubSentryEnv({ NEXT_PUBLIC_SENTRY_DSN: DSN, VERCEL_ENV: 'production' })
      const options = await loadInitOptions(load)
      const { scrubSpan } = await import('@/lib/sentry/shared')

      expect(options.beforeSendSpan).toBeTypeOf('function')
      expect(options.beforeSendSpan).toBe(scrubSpan)
      expect(options.beforeSend).toBeTypeOf('function')
      expect(options.beforeSendTransaction).toBeTypeOf('function')
      expect(options.beforeBreadcrumb).toBeTypeOf('function')

      const event = {
        request: { url: `https://nico-rank.com/search?q=${MARKER}` },
        exception: { values: [{ value: `failed: https://nico-rank.com/search?q=${MARKER}` }] },
        breadcrumbs: [{ category: 'navigation', data: { to: `/tag/${MARKER}` } }],
      }
      const transaction = {
        type: 'transaction',
        transaction: `GET /search?q=${MARKER}`,
        spans: [{ span_id: 's', trace_id: 't', start_timestamp: 0, data: { 'url.query': `q=${MARKER}` } }],
      }
      const span = { span_id: 's', trace_id: 't', start_timestamp: 0, data: { 'url.full': `/tag/${MARKER}` } }

      expect(JSON.stringify(options.beforeSend?.(event, {}))).not.toContain(MARKER)
      expect(JSON.stringify(options.beforeSendTransaction?.(transaction, {}))).not.toContain(MARKER)
      expect(JSON.stringify(options.beforeSendSpan?.(span))).not.toContain(MARKER)
      expect(
        JSON.stringify(options.beforeBreadcrumb?.({ category: 'fetch', data: { url: `/api/search?q=${MARKER}` } })),
      ).not.toContain(MARKER)
    })

    it('scrubs the transaction name of the dynamic sampling context', async () => {
      stubSentryEnv({ NEXT_PUBLIC_SENTRY_DSN: DSN, VERCEL_ENV: 'production' })
      await loadInitOptions(load)
      const { scrubDynamicSamplingContext } = await import('@/lib/sentry/shared')

      expect(clientOnMock).toHaveBeenCalledWith('createDsc', scrubDynamicSamplingContext)

      const [, onCreateDsc] = clientOnMock.mock.calls.find(([hook]) => hook === 'createDsc') ?? []
      const dsc = { trace_id: 't', transaction: `GET /search?q=${MARKER}` }
      onCreateDsc?.(dsc)
      expect(JSON.stringify(dsc)).not.toContain(MARKER)
    })

    it(runtime === 'server' ? 'drops console breadcrumbs' : 'keeps console breadcrumbs', async () => {
      const options = await loadInitOptions(load)
      const result = options.beforeBreadcrumb?.({ category: 'console', message: 'hello' })

      if (runtime === 'server') {
        expect(result).toBeNull()
      } else {
        expect(result).toEqual({ category: 'console', message: 'hello' })
      }
    })

    it.each([
      [{ VERCEL_ENV: 'production' }, 'production', true],
      [{ VERCEL_ENV: 'preview' }, 'preview', true],
      [{}, 'local', false],
      [{ NODE_ENV: 'production' }, 'local', false],
      [{ NEXT_PUBLIC_SENTRY_FORCE_ENABLE: 'true' }, 'local', true],
    ])('env %o -> environment %s, enabled %s', async (vars, environment, enabled) => {
      stubSentryEnv({ NEXT_PUBLIC_SENTRY_DSN: DSN, ...vars })
      const options = await loadInitOptions(load)

      expect(options.environment).toBe(environment)
      expect(options.enabled).toBe(enabled)
    })

    it('stays disabled without a DSN', async () => {
      stubSentryEnv({ VERCEL_ENV: 'production' })
      const options = await loadInitOptions(load)

      expect(options.enabled).toBe(false)
    })
  })
})
