// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../workers/search-budget', () => ({ SearchBudget: class {} }))
import { fetchUpstream } from '../../workers/utils/upstream-proxy'
vi.mock('../../workers/sentry.js', () => ({ Sentry: { withSentry: (_: unknown, h: unknown) => h }, createWorkerSentryOptions: vi.fn(), captureWorkerException: vi.fn(), sanitizeUrlForSentry: vi.fn() }))
import green from '../../workers/api-gateway-green-20250726'
import blue from '../../workers/api-gateway-blue-20250706'
import { isAllowedOrigin } from '../../workers/utils/cors-config'
import router from '../../workers/smart-router-20250706'
const ctx = { waitUntil: vi.fn() }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('upstream security boundaries', () => {
  it.each([301,302,303,307,308])('does not follow admin redirect %s or forward credentials again', async status => {
    const fetch = vi.fn(async (_request: Request) => new Response(null, { status, headers: { Location:'https://other.invalid/admin' } }))
    vi.stubGlobal('fetch', fetch)
    const response = await fetchUpstream(new Request('https://site.invalid/api/admin/ng-list', { method:'POST', body:'{}', headers:{Authorization:'Basic synthetic',Cookie:'synthetic=1','X-Worker-Auth':'untrusted'} }), 'https://upstream.invalid')
    expect(response.status).toBe(502)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(fetch).toHaveBeenCalledTimes(1)
    const sent=fetch.mock.calls[0][0] as unknown as Request
    expect(sent.method).toBe('POST')
    expect(await sent.text()).toBe('{}')
    expect(sent.headers.get('x-worker-auth')).toBeNull()
  })
  it.each(['https://other.invalid/x','http://upstream.invalid/x','https://u:p@upstream.invalid/x','/api/admin/ng-list'])('rejects public redirect to %s', async location => {
    const fetch=vi.fn(async()=>new Response(null,{status:302,headers:{Location:location}})); vi.stubGlobal('fetch',fetch)
    expect((await fetchUpstream(new Request('https://site.invalid/api/public'), 'https://upstream.invalid')).status).toBe(502)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('follows relative public read redirects on the same origin with stripped headers', async () => {
    const fetch=vi.fn().mockResolvedValueOnce(new Response(null,{status:307,headers:{Location:'next?q=1'}})).mockResolvedValueOnce(new Response('ok'))
    vi.stubGlobal('fetch',fetch)
    expect((await fetchUpstream(new Request('https://site.invalid/api/public',{headers:{'X-Worker-Auth':'untrusted'}}),'https://upstream.invalid')).status).toBe(200)
    expect(fetch.mock.calls[1][0].url).toBe('https://upstream.invalid/api/next?q=1')
    expect(fetch.mock.calls[1][0].headers.get('x-worker-auth')).toBeNull()
  })
  it('bounds redirect loops', async () => {
    const fetch=vi.fn(async()=>new Response(null,{status:302,headers:{Location:'/api/loop'}}));vi.stubGlobal('fetch',fetch)
    expect((await fetchUpstream(new Request('https://site.invalid/api/public'),'https://upstream.invalid')).status).toBe(502)
    expect(fetch).toHaveBeenCalledTimes(4)
  })
  it('routes admin straight to the authenticated origin and never invokes either worker', async () => {
    const fetch=vi.fn(async()=>new Response('Authentication required',{status:401,headers:{'WWW-Authenticate':'Basic'}}));vi.stubGlobal('fetch',fetch)
    const g=vi.fn(), b=vi.fn(), kv=vi.fn()
    const response=await (router.fetch as any)(new Request('https://site.invalid/api/admin/ng-list',{method:'POST',body:'{}'}),{VERCEL_DEPLOYMENT_URL:'https://upstream.invalid',WORKER_GREEN:{fetch:g},WORKER_BLUE:{fetch:b},MAINTENANCE_FLAGS:{get:kv}},ctx)
    expect(response.status).toBe(401);expect(response.headers.get('www-authenticate')).toBe('Basic')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(g).not.toHaveBeenCalled();expect(b).not.toHaveBeenCalled();expect(kv).not.toHaveBeenCalled()
  })
  it.each(['POST','PUT','PATCH','DELETE'])('does not replay %s on green failure',async method=>{
    const b=vi.fn();const g=vi.fn(async()=>{throw new Error('response lost')})
    const response=await (router.fetch as any)(new Request('https://site.invalid/api/write',{method,body:'{}'}),{WORKER_GREEN:{fetch:g},WORKER_BLUE:{fetch:b},MAINTENANCE_FLAGS:{get:async()=> 'green'}},ctx)
    expect(response.status).toBe(502);expect(b).not.toHaveBeenCalled()
  })
  it('keeps public GET failover',async()=>{
    const b=vi.fn(async()=>new Response('ok'));const g=vi.fn(async()=>{throw new Error('unavailable')})
    const response=await (router.fetch as any)(new Request('https://site.invalid/api/public'),{WORKER_GREEN:{fetch:g},WORKER_BLUE:{fetch:b},MAINTENANCE_FLAGS:{get:async()=> 'green'}},ctx)
    expect(response.status).toBe(200);expect(b).toHaveBeenCalledTimes(1)
  })
})

it('does not let a scheme-relative path change the configured upstream', async () => {
  const fetch = vi.fn(async () => new Response('ok'))
  vi.stubGlobal('fetch', fetch)
  await fetchUpstream(new Request('https://site.invalid//other.invalid/api'), 'https://upstream.invalid')
  expect((fetch.mock.calls[0] as unknown as [Request])[0].url).toBe('https://upstream.invalid//other.invalid/api')
})
it.each([green, blue])('protects directly addressed worker admin routes', async worker => {
  const fetch = vi.fn(async () => new Response(null, { status: 307, headers: { location: '/admin' } }))
  vi.stubGlobal('fetch', fetch)
  const response = await (worker.fetch as any)(new Request('https://worker.invalid/api/admin/ng-list', { headers: { authorization: 'Basic synthetic' } }), { VERCEL_DEPLOYMENT_URL: 'https://upstream.invalid' }, ctx)
  expect(response.status).toBe(502)
  expect(response.headers.get('access-control-allow-origin')).toBeNull()
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('uses exact CORS origins', () => {
  for (const origin of ['https://nico-rank.com', 'https://nico-ranking-custom-yjsns-projects.vercel.app', 'http://localhost:3000']) expect(isAllowedOrigin(origin)).toBe(true)
  for (const origin of ['http://nico-rank.com', 'https://nico-rank.com.evil.invalid', 'https://evil-nico-ranking-custom-yjsns-projects.vercel.app', 'https://nico-rank.com/path']) expect(isAllowedOrigin(origin)).toBe(false)
})
