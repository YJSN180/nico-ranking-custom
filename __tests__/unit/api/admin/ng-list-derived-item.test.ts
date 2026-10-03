import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE } from '@/app/api/admin/ng-list/derived/[videoId]/route'

// 派生NGの 1 件削除: 現在の一覧を読んでから書き戻すので、読めなければ書き込まない
const fetchMock = vi.fn()

const kvResponse = (status: number, body?: unknown) => ({ ok: status < 400, status, statusText: String(status), json: async () => body }) as unknown as Response

const del = (videoId: string) =>
  DELETE(new NextRequest(`http://localhost/api/admin/ng-list/derived/${videoId}`, { method: 'DELETE', headers: { authorization: 'Basic x', 'content-type': 'application/json' } }), {
    params: Promise.resolve({ videoId }),
  })

const putCalls = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')

describe('DELETE /api/admin/ng-list/derived/[videoId]', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc')
    vi.stubEnv('CLOUDFLARE_KV_NAMESPACE_ID', 'ns')
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'token')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('指定の動画だけを除いて書き戻す', async () => {
    fetchMock.mockResolvedValueOnce(kvResponse(200, ['sm1', 'sm2'])).mockResolvedValueOnce(kvResponse(200, { success: true }))
    const res = await del('sm1')
    expect(res.status).toBe(200)
    expect((await res.json()).remainingCount).toBe(1)
    expect(JSON.parse(String((putCalls()[0][1] as RequestInit).body))).toEqual(['sm2'])
  })

  it('一覧を読めなければ（429・5xx）空とみなして上書きせず 503', async () => {
    for (const status of [429, 500, 503]) {
      fetchMock.mockReset()
      fetchMock.mockResolvedValueOnce(kvResponse(status))
      const res = await del('sm1')
      expect(res.status).toBe(503)
      expect(putCalls()).toHaveLength(0)
    }
  })
})
