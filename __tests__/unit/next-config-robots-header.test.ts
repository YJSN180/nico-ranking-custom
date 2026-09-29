import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import nextConfig from '../../next.config.mjs'

// ビルド用のラッパーは素通しにして、このリポジトリの headers() だけを見る
vi.mock('@sentry/nextjs', () => ({
  withSentryConfig: (config: unknown) => config,
}))
vi.mock('@next/bundle-analyzer', () => ({
  default: () => (config: unknown) => config,
}))

async function robotsHeaderValues(vercelEnv: string | undefined): Promise<string[]> {
  vi.stubEnv('VERCEL_ENV', vercelEnv)
  const routes = await nextConfig.headers()
  return routes
    .filter((route) => route.source === '/:path*')
    .flatMap((route) => route.headers)
    .filter((header) => header.key.toLowerCase() === 'x-robots-tag')
    .map((header) => header.value)
}

describe('next.config headers: X-Robots-Tag', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps the production value', async () => {
    expect(await robotsHeaderValues('production')).toEqual(['all'])
  })

  it.each(['preview', 'development', undefined])(
    'keeps non-production deployments out of search engines (VERCEL_ENV=%s)',
    async (vercelEnv) => {
      expect(await robotsHeaderValues(vercelEnv)).toEqual(['noindex, nofollow'])
    },
  )

  it('is not also set in vercel.json, which applies the same value to every deployment', () => {
    const vercelJson: { headers?: Array<{ headers: Array<{ key: string }> }> } = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'),
    )
    const keys = (vercelJson.headers ?? []).flatMap((rule) =>
      rule.headers.map((header) => header.key.toLowerCase()),
    )

    expect(keys).not.toContain('x-robots-tag')
  })
})
