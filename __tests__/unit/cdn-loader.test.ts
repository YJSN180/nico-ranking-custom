/**
 * @jest-environment node
 */

import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import cdnLoader, { getAssetUrl } from '../../lib/cdn-loader'

describe('CDN Loader', () => {
  const originalEnv = process.env.NEXT_PUBLIC_CDN_URL

  beforeEach(() => {
    // Reset environment
    delete process.env.NEXT_PUBLIC_CDN_URL
  })

  afterEach(() => {
    // Restore original environment
    if (originalEnv) {
      process.env.NEXT_PUBLIC_CDN_URL = originalEnv
    } else {
      delete process.env.NEXT_PUBLIC_CDN_URL
    }
  })

  describe('cdnLoader', () => {
    test('should use default behavior when no CDN configured', () => {
      const result = cdnLoader({
        src: '/image.jpg',
        width: 800,
        quality: 80
      })

      expect(result).toBe('/image.jpg?w=800&q=80')
    })

    test('should use CDN URL when configured', () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://assets.nico-rank.com'

      const result = cdnLoader({
        src: '/image.jpg',
        width: 800,
        quality: 80
      })

      expect(result).toContain('https://assets.nico-rank.com/image.jpg')
      expect(result).toContain('w=800')
      expect(result).toContain('q=80')
      expect(result).toContain('fallback=%252Fimage.jpg')
    })

    test('should not modify external URLs', () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://assets.nico-rank.com'

      const externalUrl = 'https://example.com/external-image.jpg'
      const result = cdnLoader({
        src: externalUrl,
        width: 800,
        quality: 80
      })

      expect(result).toBe(externalUrl)
    })

    test('should use default quality when not specified', () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://assets.nico-rank.com'

      const result = cdnLoader({
        src: '/image.jpg',
        width: 800
      })

      expect(result).toContain('q=75') // Default quality
    })
  })

  describe('getAssetUrl', () => {
    test('should return path as-is when no CDN configured', () => {
      const result = getAssetUrl('/favicon.ico')
      expect(result).toBe('/favicon.ico')
    })

    test('should prepend CDN URL when configured', () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://assets.nico-rank.com'

      const result = getAssetUrl('/favicon.ico')
      expect(result).toBe('https://assets.nico-rank.com/favicon.ico')
    })

    test('should not modify external URLs', () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://assets.nico-rank.com'

      const externalUrl = 'https://example.com/external.png'
      const result = getAssetUrl(externalUrl)
      expect(result).toBe(externalUrl)
    })

    test('should normalize paths without leading slash', () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://assets.nico-rank.com'

      const result = getAssetUrl('favicon.ico')
      expect(result).toBe('https://assets.nico-rank.com/favicon.ico')
    })

    test('should handle paths that already have leading slash', () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://assets.nico-rank.com'

      const result = getAssetUrl('/favicon.ico')
      expect(result).toBe('https://assets.nico-rank.com/favicon.ico')
    })
  })

  describe('fallback behavior', () => {
    test('should include fallback parameter for server-side fallback', () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://assets.nico-rank.com'

      const result = cdnLoader({
        src: '/complex/path/image.jpg',
        width: 1200,
        quality: 90
      })

      const url = new URL(result)
      const fallback = url.searchParams.get('fallback')
      expect(decodeURIComponent(fallback || '')).toBe('/complex/path/image.jpg')
    })

    test('should properly encode fallback URLs', () => {
      process.env.NEXT_PUBLIC_CDN_URL = 'https://assets.nico-rank.com'

      const result = cdnLoader({
        src: '/image with spaces.jpg',
        width: 800
      })

      const url = new URL(result)
      const fallback = url.searchParams.get('fallback')
      expect(decodeURIComponent(fallback || '')).toBe('/image with spaces.jpg')
    })
  })
})