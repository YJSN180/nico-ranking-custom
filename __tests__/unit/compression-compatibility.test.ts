/**
 * Unit tests for compression compatibility between Node.js and Web API
 */

import { describe, test, expect } from 'vitest'
import { gzipSync } from 'zlib'

describe('Compression Compatibility Tests', () => {
  const testData = {
    items: [
      {
        id: "sm45120378",
        title: "テストランキング動画1",
        viewCount: 10000,
        mylistCount: 500,
        commentCount: 100,
        likeCount: 1000
      }
    ],
    popularTags: ["VOCALOID", "ゲーム"],
    metadata: {
      version: 1,
      updatedAt: new Date().toISOString()
    }
  }

  test('Node.js zlib compression should be compatible with Web API DecompressionStream', async () => {
    // Node.js compression (used in R2 write script)
    const jsonString = JSON.stringify(testData)
    const nodeCompressed = gzipSync(jsonString)
    
    // Web API decompression (used in Workers)
    try {
      const stream = new Response(nodeCompressed).body!.pipeThrough(new DecompressionStream('gzip'))
      const decompressedArrayBuffer = await new Response(stream).arrayBuffer()
      const decompressedString = new TextDecoder().decode(decompressedArrayBuffer)
      const parsedData = JSON.parse(decompressedString)
      
      expect(parsedData).toEqual(testData)
    } catch (error) {
      // This test might fail due to compression format incompatibility
      console.error('Compression compatibility issue:', error)
      throw error
    }
  })

  test('Web API compression should be compatible with Web API decompression', async () => {
    // Web API compression (used in KV system)
    const jsonString = JSON.stringify(testData)
    const encoder = new TextEncoder()
    const input = encoder.encode(jsonString)
    
    const compressionStream = new Response(input).body!.pipeThrough(new CompressionStream('gzip'))
    const webCompressed = new Uint8Array(await new Response(compressionStream).arrayBuffer())
    
    // Web API decompression
    const decompressionStream = new Response(webCompressed).body!.pipeThrough(new DecompressionStream('gzip'))
    const decompressedArrayBuffer = await new Response(decompressionStream).arrayBuffer()
    const decompressedString = new TextDecoder().decode(decompressedArrayBuffer)
    const parsedData = JSON.parse(decompressedString)
    
    expect(parsedData).toEqual(testData)
  })

  test('Compare compression methods - Node.js vs Web API', async () => {
    const jsonString = JSON.stringify(testData)
    
    // Node.js compression
    const nodeCompressed = gzipSync(jsonString)
    
    // Web API compression  
    const encoder = new TextEncoder()
    const input = encoder.encode(jsonString)
    const compressionStream = new Response(input).body!.pipeThrough(new CompressionStream('gzip'))
    const webCompressed = new Uint8Array(await new Response(compressionStream).arrayBuffer())
    
    console.log('Node.js compressed size:', nodeCompressed.length)
    console.log('Web API compressed size:', webCompressed.length)
    console.log('Node.js first 10 bytes:', Array.from(nodeCompressed.slice(0, 10)))
    console.log('Web API first 10 bytes:', Array.from(webCompressed.slice(0, 10)))
    
    // Check gzip magic numbers
    expect(nodeCompressed[0]).toBe(0x1f)
    expect(nodeCompressed[1]).toBe(0x8b)
    expect(webCompressed[0]).toBe(0x1f)
    expect(webCompressed[1]).toBe(0x8b)
  })

  test('Test gzip magic number detection', () => {
    const jsonString = JSON.stringify(testData)
    const compressed = gzipSync(jsonString)
    
    // Should detect as gzipped
    expect(compressed[0]).toBe(0x1f)
    expect(compressed[1]).toBe(0x8b)
    
    // Non-compressed data should not have magic numbers
    const uncompressed = new TextEncoder().encode(jsonString)
    expect(uncompressed[0]).not.toBe(0x1f)
    expect(uncompressed[1]).not.toBe(0x8b)
  })
})