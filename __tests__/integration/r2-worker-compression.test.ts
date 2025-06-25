/**
 * Integration tests for R2 Worker compression handling
 */

import { describe, test, expect, beforeAll } from 'vitest'
import { gzipSync } from 'zlib'

describe('R2 Worker Compression Integration', () => {
  const testRankingData = {
    items: [
      {
        rank: 1,
        id: "sm45120378",
        title: "テストランキング動画1",
        thumbURL: "https://nicovideo.cdn.nimg.jp/thumbnails/45120378/45120378.21534814",
        views: 10000,
        likes: 1000,
        mylists: 500,
        comments: 100,
        duration: 300,
        registeredAt: "2025-06-24T10:00:00+09:00",
        tags: ["VOCALOID", "ゲーム"],
        originalRank: 0
      }
    ],
    popularTags: ["VOCALOID", "ゲーム"],
    metadata: {
      version: 1,
      updatedAt: "2025-06-24T19:00:00Z",
      genre: "all",
      period: "24h"
    }
  }

  test('Worker should handle Node.js gzip compressed data from R2', async () => {
    // Simulate R2 data compressed with Node.js zlib (as done in write-to-r2.ts)
    const jsonString = JSON.stringify(testRankingData)
    const nodeCompressed = gzipSync(jsonString, { level: 9 })

    // Simulate Worker logic from api-gateway-r2.ts
    const mockR2Object = {
      httpMetadata: {
        contentEncoding: 'gzip'
      },
      size: nodeCompressed.length,
      arrayBuffer: async () => nodeCompressed.buffer.slice(nodeCompressed.byteOffset, nodeCompressed.byteOffset + nodeCompressed.byteLength)
    }

    // Test the Worker's handling logic
    const contentEncoding = mockR2Object.httpMetadata?.contentEncoding
    const isPreCompressed = contentEncoding === 'gzip'
    const supportsGzip = true // Client supports gzip

    expect(isPreCompressed).toBe(true)

    if (isPreCompressed && supportsGzip) {
      // This is the problematic path: serving Node.js compressed data to client
      const compressedData = await mockR2Object.arrayBuffer()
      
      // Client would try to decompress this, which might fail
      try {
        const stream = new Response(compressedData).body!.pipeThrough(new DecompressionStream('gzip'))
        const decompressedArrayBuffer = await new Response(stream).arrayBuffer()
        const decompressedString = new TextDecoder().decode(decompressedArrayBuffer)
        const parsedData = JSON.parse(decompressedString)
        
        expect(parsedData).toEqual(testRankingData)
      } catch (error) {
        console.error('Failed to decompress Node.js gzip with Web API:', error)
        throw new Error(`Compression compatibility issue: ${error}`)
      }
    }
  })

  test('Worker should handle client that does not support gzip', async () => {
    const jsonString = JSON.stringify(testRankingData)
    const nodeCompressed = gzipSync(jsonString, { level: 9 })

    const mockR2Object = {
      httpMetadata: {
        contentEncoding: 'gzip'
      },
      size: nodeCompressed.length,
      arrayBuffer: async () => nodeCompressed.buffer.slice(nodeCompressed.byteOffset, nodeCompressed.byteOffset + nodeCompressed.byteLength)
    }

    const isPreCompressed = true
    const supportsGzip = false // Client does not support gzip

    if (isPreCompressed && !supportsGzip) {
      // Worker should decompress and return uncompressed data
      const compressedData = await mockR2Object.arrayBuffer()
      
      try {
        const stream = new Response(compressedData).body!.pipeThrough(new DecompressionStream('gzip'))
        const decompressedArrayBuffer = await new Response(stream).arrayBuffer()
        const decompressedString = new TextDecoder().decode(decompressedArrayBuffer)
        const parsedData = JSON.parse(decompressedString)
        
        expect(parsedData).toEqual(testRankingData)
      } catch (error) {
        console.error('Worker failed to decompress for non-gzip client:', error)
        throw new Error(`Worker decompression failed: ${error}`)
      }
    }
  })

  test('Test magic number detection in Worker context', () => {
    const jsonString = JSON.stringify(testRankingData)
    const compressed = gzipSync(jsonString)
    
    // Simulate Worker's magic number check
    const isGzipped = compressed[0] === 0x1f && compressed[1] === 0x8b
    expect(isGzipped).toBe(true)

    // Test uncompressed data
    const uncompressed = new TextEncoder().encode(jsonString)
    const isUncompressed = uncompressed[0] !== 0x1f || uncompressed[1] !== 0x8b
    expect(isUncompressed).toBe(true)
  })

  test('Compare R2 write script approach vs Worker compression', async () => {
    const jsonString = JSON.stringify(testRankingData)
    
    // R2 write script approach (Node.js zlib)
    const r2Compressed = gzipSync(jsonString, { level: 9 })
    
    // Worker compression approach (Web API)
    const encoder = new TextEncoder()
    const input = encoder.encode(jsonString)
    const workerCompressionStream = new Response(input).body!.pipeThrough(new CompressionStream('gzip'))
    const workerCompressed = new Uint8Array(await new Response(workerCompressionStream).arrayBuffer())
    
    console.log('R2 script compression size:', r2Compressed.length)
    console.log('Worker compression size:', workerCompressed.length)
    
    // Both should have gzip magic numbers
    expect(r2Compressed[0]).toBe(0x1f)
    expect(r2Compressed[1]).toBe(0x8b)
    expect(workerCompressed[0]).toBe(0x1f)
    expect(workerCompressed[1]).toBe(0x8b)
    
    // Test cross-compatibility
    try {
      // Can Worker decompress R2-compressed data?
      const r2ToWorkerStream = new Response(r2Compressed).body!.pipeThrough(new DecompressionStream('gzip'))
      const r2ToWorkerResult = await new Response(r2ToWorkerStream).arrayBuffer()
      const r2ToWorkerString = new TextDecoder().decode(r2ToWorkerResult)
      expect(JSON.parse(r2ToWorkerString)).toEqual(testRankingData)
      
      // Can Worker decompress its own compression?
      const workerToWorkerStream = new Response(workerCompressed).body!.pipeThrough(new DecompressionStream('gzip'))
      const workerToWorkerResult = await new Response(workerToWorkerStream).arrayBuffer()
      const workerToWorkerString = new TextDecoder().decode(workerToWorkerResult)
      expect(JSON.parse(workerToWorkerString)).toEqual(testRankingData)
      
    } catch (error) {
      console.error('Cross-compatibility test failed:', error)
      throw error
    }
  })
})