import { spawnSync } from 'node:child_process'
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function quotedValues(file: string, name: string): string[] {
  const text = fs.readFileSync(path.join(repoRoot, file), 'utf8')
  return [...text.matchAll(new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, 'gm'))].map((match) => match[1])
}

// Vercel deployment URLs (<project>-<9 char hash>-<scope>.vercel.app) are immutable snapshots of one build.
const PINNED_DEPLOYMENT = /^https:\/\/nico-ranking-custom-[a-z0-9]{9}-yjsns-projects\.vercel\.app/

describe('worker upstream configuration', () => {
  it('green proxies unhandled API paths to the same production alias as the router', () => {
    const router = quotedValues('wrangler.toml', 'VERCEL_DEPLOYMENT_URL')
    const green = quotedValues('workers/wrangler-green.toml', 'VERCEL_DEPLOYMENT_URL')

    expect(router.length).toBeGreaterThan(0)
    expect(new Set(router).size).toBe(1)
    expect(green).toEqual([router[0]])
    expect(green[0]).not.toMatch(PINNED_DEPLOYMENT)
  })
})

it('legacy green config paths describe the same deployment, never the router', () => {
  for (const file of ['wrangler-green.toml', 'workers/wrangler.toml']) {
    expect(quotedValues(file, 'name')[0]).toBe('nico-ranking-api-gateway-green')
    expect(quotedValues(file, 'VERCEL_DEPLOYMENT_URL')).toEqual(quotedValues('workers/wrangler-green.toml', 'VERCEL_DEPLOYMENT_URL'))
    expect(quotedValues(file, 'compatibility_date')).toEqual(['2024-12-01'])
  }
})

it('deployment guard rejects mismatched sources/configs and accepts the canonical target', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/validate-worker-target.mjs', ...args], { encoding: 'utf8' })
  expect(run('nico-ranking-api-gateway-green', 'workers/api-gateway-green-20250726.ts', 'workers/wrangler-green.toml').status).toBe(0)
  expect(run('nico-ranking-api-gateway-green', 'workers/api-gateway-green-20250726.ts', 'workers/wrangler.toml').status).toBe(1)
  expect(run('nico-ranking-api-gateway', 'workers/api-gateway-green-20250726.ts', 'wrangler.toml').status).toBe(1)
})

function bindingBlock(file: string, name: string): string | undefined {
  const text = fs.readFileSync(path.join(repoRoot, file), 'utf8')
  return text.split('[[').find((block) => new RegExp(`^name\\s*=\\s*"${name}"`, 'm').test(block))
}

describe('green search rate limit binding', () => {
  it('has its own rate limit namespace for the search endpoints', () => {
    const search = bindingBlock('workers/wrangler-green.toml', 'SEARCH_RATE_LIMITER')
    const ranking = bindingBlock('workers/wrangler-green.toml', 'RATE_LIMITER')
    const namespace = (block?: string) => /namespace_id\s*=\s*"(\d+)"/.exec(block ?? '')?.[1]

    expect(search).toMatch(/type\s*=\s*"ratelimit"/)
    expect(search).toMatch(/simple\s*=\s*\{\s*limit\s*=\s*60,\s*period\s*=\s*60\s*\}/)
    expect(namespace(search)).toBeDefined()
    expect(namespace(search)).not.toBe(namespace(ranking))
  })
})
