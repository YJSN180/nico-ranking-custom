import { describe, it, expect } from 'vitest'
import { shouldSkipInitialFetch } from '@/app/client-page'

const baseConfig = {
  genre: 'all',
  period: '24h',
  tag: undefined,
} as const

describe('shouldSkipInitialFetch', () => {
  it('returns true only when initial load, no force, and config matches initial', () => {
    const result = shouldSkipInitialFetch(true, false, baseConfig, 'all', '24h', undefined)
    expect(result).toBe(true)
  })

  it('returns false when force is true even if config matches', () => {
    const result = shouldSkipInitialFetch(true, true, baseConfig, 'all', '24h', undefined)
    expect(result).toBe(false)
  })

  it('returns false when config differs', () => {
    const result = shouldSkipInitialFetch(true, false, { ...baseConfig, period: 'hour' }, 'all', '24h', undefined)
    expect(result).toBe(false)
  })

  it('returns false after initial load has completed', () => {
    const result = shouldSkipInitialFetch(false, false, baseConfig, 'all', '24h', undefined)
    expect(result).toBe(false)
  })
})
