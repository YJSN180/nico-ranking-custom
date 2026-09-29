// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

// Point the store's real S3 client at a local server so the SDK's response middleware runs unmodified.
const local = vi.hoisted(() => ({ endpoint: '' }))
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  class LocalS3Client extends actual.S3Client {
    constructor(config: ConstructorParameters<typeof actual.S3Client>[0]) {
      super({ ...config, endpoint: local.endpoint, forcePathStyle: true })
    }
  }
  return { ...actual, S3Client: LocalS3Client }
})

import { closeTagCacheR2Client, readTagCacheShardFromR2, writeTagCacheShardToR2 } from '@/lib/tag-cache-store'

let server: Server | undefined

afterEach(async () => {
  closeTagCacheR2Client()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
    server = undefined
  }
})

it('rejects promptly when an R2 body that carries a checksum header is cut off', async () => {
  server = createServer((request, response) => {
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': '4096',
      ETag: '"placeholder"',
      'x-amz-checksum-crc32': 'AAAAAA==',
    })
    response.write('{"sm1":')
    setTimeout(() => request.socket.destroy(), 50)
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  local.endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) vi.stubEnv(key, 'test-placeholder')

  const outcome = readTagCacheShardFromR2(7).then(
    () => 'resolved',
    (error: Error) => `rejected:${error.name}`,
  )
  const settled = await Promise.race([
    outcome,
    new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 3_000)),
  ])

  // Before the fix the SDK checksum stream never ended, so the read stayed pending until the group deadline.
  expect(settled).toMatch(/^rejected:/)
  expect(settled).not.toBe('rejected:TimeoutError')
}, 10_000)

it('aborts a shard write that never gets a response and leaves no request open', async () => {
  const closed: string[] = []
  server = createServer((request) => {
    request.resume()
    request.socket.once('close', () => closed.push(request.method ?? ''))
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  local.endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) vi.stubEnv(key, 'test-placeholder')
  const realTimeout = AbortSignal.timeout.bind(AbortSignal)
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(100))

  const outcome = writeTagCacheShardToR2(7, {
    sm1: { tags: [{ name: 'Tag', isLocked: false }], fetchedAt: new Date().toISOString(), source: 'nicolog' },
  }).then(
    () => 'resolved',
    (error: Error) => `rejected:${error.name}`,
  )
  const settled = await Promise.race([
    outcome,
    new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 3_000)),
  ])

  // Before the fix the upload had no time limit and waited for the server indefinitely.
  expect(settled).toMatch(/^rejected:(AbortError|TimeoutError)$/)
  expect(timeout).toHaveBeenCalledWith(20_000)
  await vi.waitFor(() => expect(closed).toEqual(['PUT']))
}, 10_000)
