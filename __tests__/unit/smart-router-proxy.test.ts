import { describe, expect, it } from 'vitest'

import {
  buildProxyRequestInit,
  readReplayableBody,
} from '@/workers/smart-router-20250706'

describe('buildProxyRequestInit', () => {
  it('omits body for GET requests', () => {
    const request = new Request('https://nico-rank.com/', {
      method: 'GET',
    })

    const init = buildProxyRequestInit(request, new Headers(), 'follow')

    expect(init.method).toBe('GET')
    expect('body' in init).toBe(false)
  })

  it('omits body for HEAD requests', () => {
    const request = new Request('https://nico-rank.com/', {
      method: 'HEAD',
    })

    const init = buildProxyRequestInit(request, new Headers(), 'follow')

    expect(init.method).toBe('HEAD')
    expect('body' in init).toBe(false)
  })

  it('preserves body for POST requests', async () => {
    const request = new Request('https://nico-rank.com/', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
    })
    const replayableBody = await readReplayableBody(request)

    const init = buildProxyRequestInit(request, new Headers(), 'follow', replayableBody)

    expect(init.method).toBe('POST')
    expect('body' in init).toBe(true)
    expect(await new Response(init.body).text()).toBe('{"hello":"world"}')
  })

  it('creates a replayable buffer for POST requests', async () => {
    const request = new Request('https://nico-rank.com/login/', {
      method: 'POST',
      body: 'email=test@example.com',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    const replayableBody = await readReplayableBody(request)

    expect(replayableBody).toBeInstanceOf(ArrayBuffer)
    expect(await new Response(replayableBody).text()).toBe('email=test@example.com')
  })

  it('returns null replayable body for GET requests', async () => {
    const request = new Request('https://nico-rank.com/')

    await expect(readReplayableBody(request)).resolves.toBeNull()
  })
})
