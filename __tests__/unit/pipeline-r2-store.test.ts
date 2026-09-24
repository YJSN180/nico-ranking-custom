// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

// Point the store's real S3 client at a local server so the SDK's response middleware runs unmodified.
const local = vi.hoisted(() => ({ endpoint: '' }))
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  class LocalS3Client extends actual.S3Client {
    constructor(config: ConstructorParameters<typeof actual.S3Client>[0]) {
      super({ ...config, ...(local.endpoint ? { endpoint: local.endpoint, forcePathStyle: true } : {}) })
    }
  }
  return { ...actual, S3Client: LocalS3Client }
})
// Keep the real retry policy but skip its back-off sleeps, so every attempt runs quickly.
vi.mock('../../lib/pipeline/retry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/pipeline/retry')>()
  return {
    ...actual,
    retry: <T>(operation: () => Promise<T>, options: Parameters<typeof actual.retry>[1] = {}) =>
      actual.retry(operation, { ...options, sleep: async () => undefined }),
  }
})

import { closeR2Client, createR2Client, createR2Store } from '../../scripts/lib/r2-store'

let server: Server | undefined

async function serve(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<void> {
  server = createServer(handler)
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  local.endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function stubCredentials(): void {
  for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) vi.stubEnv(key, 'test-placeholder')
}

function outcomeOf(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'resolved', (error: Error) => `rejected:${error.name}`)
}

async function settledWithin(promise: Promise<string>, ms: number): Promise<string> {
  return Promise.race([promise, new Promise<string>((resolve) => setTimeout(() => resolve('pending'), ms))])
}

function cutOffWithChecksum(request: IncomingMessage, response: ServerResponse): void {
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': '4096',
    ETag: '"placeholder"',
    'x-amz-checksum-crc32': 'AAAAAA==',
  })
  response.write('{"generation":')
  setTimeout(() => request.socket.destroy(), 20)
}

async function actualS3Client() {
  return (await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3')).S3Client
}

afterEach(async () => {
  closeR2Client()
  local.endpoint = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
    server = undefined
  }
})

describe('publication store R2 reads', () => {
  it('fails every cut-off read attempt instead of hanging', async () => {
    let requests = 0
    await serve((request, response) => {
      requests += 1
      cutOffWithChecksum(request, response)
    })
    stubCredentials()

    const outcome = await settledWithin(outcomeOf(createR2Store().read('rankings/current.json')), 5_000)

    // Before the fix the first attempt's checksum stream never ended, so the read stayed pending.
    expect(outcome).toMatch(/^rejected:/)
    expect(outcome).not.toBe('rejected:TimeoutError')
    expect(requests).toBe(5)
  }, 10_000)

  it('retries a cut-off read and returns the object', async () => {
    let requests = 0
    await serve((request, response) => {
      requests += 1
      if (requests === 1) {
        cutOffWithChecksum(request, response)
        return
      }
      response.writeHead(200, { 'Content-Type': 'application/json', ETag: '"second"' })
      response.end(JSON.stringify({ generation: '100-1' }))
    })
    stubCredentials()

    await expect(createR2Store().read('rankings/current.json')).resolves.toEqual({
      data: { generation: '100-1' },
      etag: '"second"',
    })
    expect(requests).toBe(2)
  }, 10_000)

  it('bounds a read attempt whose body never settles', async () => {
    vi.useFakeTimers()
    stubCredentials()
    const S3Client = await actualS3Client()
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ETag: '"placeholder"',
      Body: { transformToByteArray: () => new Promise<Uint8Array>(() => {}) },
    } as never)

    const outcome = outcomeOf(createR2Store().read('rankings/current.json'))
    await vi.advanceTimersByTimeAsync(29_000)
    expect(await Promise.race([outcome, Promise.resolve('pending')])).toBe('pending')
    await vi.advanceTimersByTimeAsync(5 * 30_000)
    expect(await Promise.race([outcome, Promise.resolve('pending')])).toBe('rejected:TimeoutError')
    expect(send).toHaveBeenCalledTimes(5)
  })

  it('shares one client that does not validate response checksums', async () => {
    stubCredentials()
    const S3Client = await actualS3Client()
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ETag: '"placeholder"',
      Body: { transformToByteArray: async () => new TextEncoder().encode('{"ok":true}') },
    } as never)

    await createR2Store().read('a.json')
    await createR2Store().read('b.json')

    const clients = new Set(send.mock.contexts)
    expect(clients.size).toBe(1)
    const [client] = clients as Set<InstanceType<typeof S3Client>>
    await expect(client.config.responseChecksumValidation()).resolves.toBe('WHEN_REQUIRED')
    await expect(createR2Client().config.responseChecksumValidation()).resolves.toBe('WHEN_REQUIRED')
  })
})

describe('publication store R2 writes', () => {
  it('aborts a write that never gets a response and leaves no request open', async () => {
    const closed: string[] = []
    await serve((request) => {
      request.resume()
      request.socket.once('close', () => closed.push(request.method ?? ''))
    })
    stubCredentials()
    const realTimeout = AbortSignal.timeout.bind(AbortSignal)
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(100))

    const outcome = await settledWithin(
      outcomeOf(createR2Store().write('pipeline/auxiliary.json', Buffer.from('{}'), {})),
      5_000,
    )

    expect(outcome).toMatch(/^rejected:(AbortError|TimeoutError)$/)
    expect(timeout).toHaveBeenCalledWith(20_000)
    await vi.waitFor(() => expect(closed).toEqual(['PUT', 'PUT', 'PUT', 'PUT', 'PUT']))
  }, 10_000)

  it('bounds a write attempt that never settles', async () => {
    vi.useFakeTimers()
    stubCredentials()
    const S3Client = await actualS3Client()
    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation(() => new Promise(() => {}))

    const outcome = outcomeOf(createR2Store().write('pipeline/auxiliary.json', Buffer.from('{}'), {}))
    await vi.advanceTimersByTimeAsync(29_000)
    expect(await Promise.race([outcome, Promise.resolve('pending')])).toBe('pending')
    await vi.advanceTimersByTimeAsync(5 * 30_000)
    expect(await Promise.race([outcome, Promise.resolve('pending')])).toBe('rejected:TimeoutError')
    expect(send).toHaveBeenCalledTimes(5)
  })
})
