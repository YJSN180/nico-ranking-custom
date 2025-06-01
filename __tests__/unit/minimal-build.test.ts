import { describe, it, expect } from 'vitest'

describe('Minimal Build Test', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2)
  })
  
  it('should have valid environment', () => {
    expect(process.env.NODE_ENV).toBeDefined()
  })
})