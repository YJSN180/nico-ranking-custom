import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runDerivedNgVideoInfoUpdate } from '@/workers/derived-ng-video-info-updater/src/index.js'

global.fetch = vi.fn()

describe('Derived NG Video Info Updater Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates meta and uses lock during run', async () => {
    const store = new Map<string, string>()
    const puts: Array<{ key: string; value: string; options?: any }> = []
    const deletes: string[] = []

    store.set('ng-list-derived', JSON.stringify(['sm1', 'sm2']))
    store.set(
      'ng-derived-video-info-meta',
      JSON.stringify({
        cursor: 0,
        refreshActive: false,
        lastRefreshAt: new Date().toISOString()
      })
    )

    const kv = {
      get: async (key: string) => (store.has(key) ? store.get(key) : null),
      put: async (key: string, value: string, options?: any) => {
        store.set(key, value)
        puts.push({ key, value, options })
      },
      delete: async (key: string) => {
        store.delete(key)
        deletes.push(key)
      }
    }

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ contentId: 'sm1', title: 'Title 1', userId: 'u1' }]
      })
    } as Response)

    await runDerivedNgVideoInfoUpdate({ NG_DATA: kv })

    const putKeys = puts.map(entry => entry.key)
    expect(putKeys).toContain('ng-derived-video-info-lock')
    expect(putKeys).toContain('ng-derived-video-info-meta')
    expect(putKeys).toContain('ng-derived-video-info-map')
    expect(deletes).toContain('ng-derived-video-info-lock')

    const mapValue = store.get('ng-derived-video-info-map')
    expect(mapValue).toBeTruthy()

    const map = JSON.parse(mapValue as string)
    expect(map.sm1.title).toBe('Title 1')
    expect(map.sm2.isDeleted).toBe(true)

    const metaValue = store.get('ng-derived-video-info-meta')
    const meta = JSON.parse(metaValue as string)
    expect(meta.lastRunAt).toBeTruthy()
  })
})
