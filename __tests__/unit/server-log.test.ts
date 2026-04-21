describe('serverLog', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  function mockProductionWindow() {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          hostname: 'nico-rank.com',
          origin: 'https://nico-rank.com',
        },
      },
    })
  }

  it('does not send info logs to the server in production', async () => {
    mockProductionWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { serverLog } = await import('@/lib/server-log')

    await serverLog.info('Config change debug info', { genre: 'all' })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('deduplicates repeated warn logs in production', async () => {
    mockProductionWindow()
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { serverLog } = await import('@/lib/server-log')

    await serverLog.warn('Ranking API non-200', { status: 500 })
    await serverLog.warn('Ranking API non-200', { status: 500 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
