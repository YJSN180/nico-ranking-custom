import { describe, it, expect, vi, afterEach } from 'vitest'
import { saveVideoThumbnail } from '@/lib/save-video-thumbnail'

const video = {
  id: 'sm123',
  thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/123/123',
}
const hd = `${video.thumbURL}.original`
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
function downloadSetup() {
  vi.useFakeTimers()
  const create = vi.fn(() => 'blob:thumbnail')
  const revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    },
  )
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})
  return { create, revoke, click }
}
const image = () => ({
  ok: true,
  blob: async () => new Blob(['image'], { type: 'image/png' }),
})
describe('saveVideoThumbnail', () => {
  it('saves ss images from goptim even when HD lookup is unavailable', async () => {
    const { click } = downloadSetup()
    const short = { id: 'ss46678223', thumbURL: 'https://goptim.video.nimg.jp/thumbnail/720x1280?i=46678223.20245450&key=synthetic-key' }
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ thumbnail: null }) })
      .mockResolvedValueOnce(image())
    vi.stubGlobal('fetch', fetch)
    await saveVideoThumbnail(short)
    expect(fetch).toHaveBeenLastCalledWith(`/api/thumbnail-proxy?url=${encodeURIComponent(short.thumbURL)}`)
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('ss46678223.png')
  })

  it('downloads the HD image using a proxy and the actual image extension', async () => {
    const { click, revoke } = downloadSetup()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ thumbnail: hd }),
      })
      .mockResolvedValueOnce(image())
    vi.stubGlobal('fetch', fetch)
    await saveVideoThumbnail(video)
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/thumbnail-proxy?url=${encodeURIComponent(hd)}`,
    )
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('sm123.png')
    expect(anchor.href).toBe('blob:thumbnail')
    expect(document.body.contains(anchor)).toBe(false)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revoke).toHaveBeenCalledWith('blob:thumbnail')
  })
  it('falls back to the visible thumbnail when the HD proxy fails', async () => {
    downloadSetup()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ thumbnail: hd }),
      })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(image())
    vi.stubGlobal('fetch', fetch)
    await saveVideoThumbnail(video)
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/thumbnail-proxy?url=${encodeURIComponent(video.thumbURL)}`,
    )
  })
  it('never downloads an HTML error or opens an untrusted returned URL', async () => {
    const { click } = downloadSetup()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ thumbnail: 'https://evil.example/image' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: async () => new Blob(['error'], { type: 'text/html' }),
        }),
    )
    await expect(saveVideoThumbnail(video)).rejects.toThrow(
      'Thumbnail download failed',
    )
    expect(click).not.toHaveBeenCalled()
  })
  it('still saves the visible image when HD lookup is unavailable', async () => {
    const { click } = downloadSetup()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(image()),
    )
    await saveVideoThumbnail(video)
    expect(click).toHaveBeenCalledTimes(1)
  })
})
