import { timingSafeEqual } from 'node:crypto'

export function isWorkerAuthorized(request, secret) {
  if (typeof secret !== 'string' || !secret) return false
  const encoder = new TextEncoder()
  const expected = encoder.encode(`Bearer ${secret}`)
  const actual = encoder.encode(request.headers.get('Authorization') || '')
  return (
    actual.byteLength === expected.byteLength &&
    timingSafeEqual(actual, expected)
  )
}

export async function verifyRanking(request, env) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!isWorkerAuthorized(request, env.WORKER_AUTH_KEY)) {
    return new Response('Unauthorized', { status: 401, headers })
  }
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { ...headers, Allow: 'GET' },
    })
  }
  if (new URL(request.url).search) {
    return new Response('Query parameters are not supported', {
      status: 400,
      headers,
    })
  }
  if (!env.PRODUCTION_GATEWAY) {
    return new Response('Production gateway binding is missing', {
      status: 503,
      headers,
    })
  }

  try {
    // Exercise the same router and active Blue/Green handler, without the public bot challenge.
    const response = await env.PRODUCTION_GATEWAY.fetch(
      new Request('https://nico-rank.com/api/ranking?genre=all&period=24h', {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'nico-ranking-pipeline/1.0',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      }),
    )
    const activeWorker = response.headers.get('X-Active-Worker')
    const generation = response.headers.get('X-Ranking-Generation')
    if (
      response.status !== 200 ||
      !['blue', 'green'].includes(activeWorker) ||
      !generation
    ) {
      await response.body?.cancel()
      return new Response('Production gateway returned an invalid response', {
        status: 502,
        headers,
      })
    }
    const ranking = await response.json()
    if (
      !Array.isArray(ranking.items) ||
      ranking.items.length === 0 ||
      typeof ranking.metadata?.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(ranking.metadata.updatedAt))
    ) {
      return new Response('Production ranking is invalid', {
        status: 502,
        headers,
      })
    }
    return Response.json(
      {
        verifiedVia: 'production-router-service-binding',
        activeWorker,
        generation,
        updatedAt: ranking.metadata.updatedAt,
        count: ranking.items.length,
      },
      { headers },
    )
  } catch {
    return new Response('Production ranking verification failed', {
      status: 502,
      headers,
    })
  }
}
