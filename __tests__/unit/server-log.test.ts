describe('serverLog', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function mockProductionWindow() {
    vi.stubGlobal('window', {
      location: {
        hostname: 'nico-rank.com',
        origin: 'https://nico-rank.com',
      },
    })
  }

  it('does not send any logs to the server in production builds', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mockProductionWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { serverLog } = await import('@/lib/server-log')

    await serverLog.info('Config change debug info', { genre: 'all' })
    await serverLog.warn('Ranking API non-200', { status: 500 })
    await serverLog.error('Ranking API fetch failed', { message: 'network' })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends logs to the dev server during development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { serverLog } = await import('@/lib/server-log')

    await serverLog.warn('Ranking API non-200', { status: 500 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/debug-log',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('does not send during server rendering in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubGlobal('window', undefined)
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { serverLog } = await import('@/lib/server-log')

    await serverLog.info('Cache cleared on page load', { isReload: false })
    await serverLog.warn('Ranking API non-200', { status: 500 })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
