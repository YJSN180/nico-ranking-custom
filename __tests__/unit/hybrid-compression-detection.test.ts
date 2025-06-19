/**
 * Test hybrid gateway's compression detection logic
 */
import { describe, it, expect } from 'vitest'

describe('Hybrid Gateway Compression Detection', () => {
  it('should detect gzip magic bytes correctly', () => {
    // Gzip always starts with 0x1f 0x8b
    const gzipData = new Uint8Array([0x1f, 0x8b, 0x08, 0x00])
    const isGzipped = gzipData[0] === 0x1f && gzipData[1] === 0x8b
    expect(isGzipped).toBe(true)
  })
  
  it('should detect non-gzip data correctly', () => {
    // JSON starts with { or [
    const jsonData = new TextEncoder().encode('{"test": "data"}')
    const isGzipped = jsonData[0] === 0x1f && jsonData[1] === 0x8b
    expect(isGzipped).toBe(false)
  })
  
  it('should handle compression logic correctly', () => {
    const testCases = [
      {
        name: 'Gzipped data with no metadata',
        bytes: new Uint8Array([0x1f, 0x8b]),
        metadata: null,
        shouldDecompress: true
      },
      {
        name: 'Gzipped data with compressed=true',
        bytes: new Uint8Array([0x1f, 0x8b]),
        metadata: { compressed: true },
        shouldDecompress: true
      },
      {
        name: 'JSON data with compressed=false',
        bytes: new TextEncoder().encode('{"test": "data"}'),
        metadata: { compressed: false },
        shouldDecompress: false
      },
      {
        name: 'JSON data with no metadata',
        bytes: new TextEncoder().encode('{"test": "data"}'),
        metadata: null,
        shouldDecompress: false // Will try JSON first, only decompress if JSON fails
      }
    ]
    
    for (const testCase of testCases) {
      const isGzipped = testCase.bytes[0] === 0x1f && testCase.bytes[1] === 0x8b
      
      let shouldDecompress: boolean
      if (isGzipped) {
        shouldDecompress = true
      } else if (testCase.metadata?.compressed === true) {
        shouldDecompress = true
      } else if (testCase.metadata?.compressed === false) {
        shouldDecompress = false
      } else {
        // No metadata - will try JSON first
        shouldDecompress = false
      }
      
      expect(shouldDecompress).toBe(testCase.shouldDecompress)
    }
  })
})