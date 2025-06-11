import { describe, it, expect } from 'vitest'

describe('Cloudflare Workers Complete Tests', () => {
  const WORKERS_URL = 'https://nico-ranking-api-gateway.yjsn180180.workers.dev'
  
  describe('Basic Functionality', () => {
    it('should proxy homepage correctly', async () => {
      const response = await fetch(WORKERS_URL)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
    })
    
    it('should proxy API endpoints', async () => {
      const response = await fetch(`${WORKERS_URL}/api/ranking?genre=all&period=24h`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
    })
  })
  
  describe('Security Headers', () => {
    it('should include all required security headers', async () => {
      const response = await fetch(WORKERS_URL)
      
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(response.headers.get('x-frame-options')).toBe('DENY')
      expect(response.headers.get('x-xss-protection')).toBe('1; mode=block')
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    })
  })
  
  describe('Performance', () => {
    it('should handle concurrent requests', async () => {
      const requests = Array(5).fill(null).map(() => 
        fetch(`${WORKERS_URL}/api/status`)
      )
      
      const responses = await Promise.all(requests)
      responses.forEach(response => {
        expect(response.status).toBeLessThan(500)
      })
    })
  })
})