import { describe, it, expect } from 'vitest'
import { isMobileUserAgent } from '@/lib/user-agent'

describe('Server-side Mobile Detection', () => {
  describe('isMobileUserAgent', () => {
    it('should detect mobile devices from User-Agent header', () => {
      // iOS Safari
      expect(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1')).toBe(true)
      
      // Android Chrome
      expect(isMobileUserAgent('Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36')).toBe(true)
      
      // iPad (should be detected as mobile)
      expect(isMobileUserAgent('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1')).toBe(true)
    })

    it('should not detect desktop browsers as mobile', () => {
      // Desktop Chrome
      expect(isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36')).toBe(false)
      
      // Desktop Safari
      expect(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15')).toBe(false)
      
      // Desktop Firefox
      expect(isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/112.0')).toBe(false)
    })

    it('should handle null or undefined User-Agent', () => {
      expect(isMobileUserAgent(null)).toBe(false)
      expect(isMobileUserAgent(undefined)).toBe(false)
      expect(isMobileUserAgent('')).toBe(false)
    })

    it('should detect mobile keywords in User-Agent', () => {
      expect(isMobileUserAgent('Something Mobile Something')).toBe(true)
      expect(isMobileUserAgent('Android Device')).toBe(true)
      expect(isMobileUserAgent('iPhone Simulator')).toBe(true)
    })
  })
})