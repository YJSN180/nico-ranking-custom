/** Forward only to the configured origin; never replay a privileged request on redirect. */
export const isAdminPath = (pathname: string): boolean =>
  pathname === '/admin' || pathname.startsWith('/admin/') ||
  pathname === '/api/admin' || pathname.startsWith('/api/admin/')

export const isSafeMethod = (method: string): boolean => method === 'GET' || method === 'HEAD'

export function noStore(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store, must-revalidate')
  headers.set('CDN-Cache-Control', 'no-store')
  headers.set('Vercel-CDN-Cache-Control', 'no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export async function fetchUpstream(request: Request, base: string): Promise<Response> {
  const original = new URL(request.url)
  const upstream = new URL(base)
  if (upstream.protocol !== 'https:' || upstream.username || upstream.password) {
    return noStore(new Response('Gateway configuration error', { status: 502 }))
  }
  let target = new URL(upstream.origin)
  target.pathname = original.pathname
  target.search = original.search
  const headers = new Headers(request.headers)
  headers.delete('Host')
  headers.delete('X-Worker-Auth')
  headers.set('X-Forwarded-Host', original.host)
  headers.set('X-Forwarded-Proto', 'https')
  const admin = isAdminPath(original.pathname)
  for (let hop = 0; hop < 4; hop++) {
    // Constructing from Request preserves the streaming body (also under Node's duplex rules).
    const outgoing = new Request(new Request(target, request), { headers, redirect: 'manual' })
    const response = await fetch(outgoing)
    if (![301, 302, 303, 307, 308].includes(response.status)) return admin ? noStore(response) : response
    const location = response.headers.get('Location')
    let next: URL | undefined
    try { if (location) next = new URL(location, target) } catch { /* Invalid redirect. */ }
    await response.body?.cancel()
    if (admin || !isSafeMethod(request.method) || !next || next.origin !== upstream.origin ||
        next.username || next.password || isAdminPath(next.pathname) || hop === 3) {
      return noStore(new Response('Unexpected upstream redirect', { status: 502 }))
    }
    target = next
  }
  return noStore(new Response('Gateway Error', { status: 502 }))
}
