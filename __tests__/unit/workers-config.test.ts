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
