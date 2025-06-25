/**
 * Unified Compression Library - Web API Standard Based
 * 
 * This library provides a standardized compression/decompression interface
 * using Web API CompressionStream/DecompressionStream across all environments.
 * Supports backward compatibility with existing Node.js zlib and pako formats.
 */

// Compression format detection magic numbers
const GZIP_MAGIC_NUMBER_1 = 0x1f
const GZIP_MAGIC_NUMBER_2 = 0x8b

/**
 * Compression formats supported by the unified library
 */
export enum CompressionFormat {
  GZIP_WEB_API = 'gzip-web-api',
  GZIP_NODEJS = 'gzip-nodejs', 
  GZIP_PAKO = 'gzip-pako',
  UNCOMPRESSED = 'uncompressed'
}

/**
 * Compression result with metadata
 */
export interface CompressionResult {
  data: Uint8Array
  format: CompressionFormat
  originalSize: number
  compressedSize: number
  compressionRatio: number
}

/**
 * Decompression result with metadata
 */
export interface DecompressionResult {
  data: string
  detectedFormat: CompressionFormat
  originalSize: number
  decompressedSize: number
}

/**
 * Unified compression error with detailed context
 */
export class UnifiedCompressionError extends Error {
  constructor(
    message: string,
    public readonly operation: 'compress' | 'decompress',
    public readonly format?: CompressionFormat,
    public readonly originalError?: Error
  ) {
    super(message)
    this.name = 'UnifiedCompressionError'
  }
}

/**
 * Detect compression format by examining data header
 */
export function detectCompressionFormat(data: Uint8Array): CompressionFormat {
  // Check for gzip magic numbers
  if (data.length >= 2 && data[0] === GZIP_MAGIC_NUMBER_1 && data[1] === GZIP_MAGIC_NUMBER_2) {
    // All gzip variants have the same magic numbers, so we default to Web API format
    // The actual format difference is in how they're created, not how they're structured
    return CompressionFormat.GZIP_WEB_API
  }
  
  return CompressionFormat.UNCOMPRESSED
}

/**
 * Compress data using Web API CompressionStream (standardized approach)
 */
export async function compressData(input: string | object): Promise<CompressionResult> {
  try {
    // Convert input to string if it's an object
    const jsonString = typeof input === 'string' ? input : JSON.stringify(input)
    const originalSize = new TextEncoder().encode(jsonString).length
    
    // Use Web API CompressionStream for consistent results across environments
    const encoder = new TextEncoder()
    const inputData = encoder.encode(jsonString)
    
    // Create compression stream
    const compressionStream = new CompressionStream('gzip')
    const writer = compressionStream.writable.getWriter()
    const reader = compressionStream.readable.getReader()
    
    // Start compression
    const writePromise = writer.write(inputData).then(() => writer.close())
    
    // Read compressed data
    const chunks: Uint8Array[] = []
    let totalSize = 0
    
    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        totalSize += value.length
      }
    })()
    
    // Wait for both operations to complete
    await Promise.all([writePromise, readPromise])
    
    // Combine chunks into single Uint8Array
    const compressedData = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of chunks) {
      compressedData.set(chunk, offset)
      offset += chunk.length
    }
    
    const compressionRatio = (originalSize - compressedData.length) / originalSize * 100
    
    return {
      data: compressedData,
      format: CompressionFormat.GZIP_WEB_API,
      originalSize,
      compressedSize: compressedData.length,
      compressionRatio
    }
    
  } catch (error) {
    throw new UnifiedCompressionError(
      `Failed to compress data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'compress',
      CompressionFormat.GZIP_WEB_API,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Decompress data with automatic format detection and fallback
 */
export async function decompressData(compressedData: Uint8Array): Promise<DecompressionResult> {
  const detectedFormat = detectCompressionFormat(compressedData)
  
  // If data is not compressed, return as-is
  if (detectedFormat === CompressionFormat.UNCOMPRESSED) {
    try {
      const jsonString = new TextDecoder().decode(compressedData)
      return {
        data: jsonString,
        detectedFormat,
        originalSize: compressedData.length,
        decompressedSize: compressedData.length
      }
    } catch (error) {
      throw new UnifiedCompressionError(
        `Failed to decode uncompressed data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'decompress',
        detectedFormat,
        error instanceof Error ? error : undefined
      )
    }
  }
  
  // Try decompression with multiple methods for backward compatibility
  const decompressMethods = [
    () => decompressWithWebAPI(compressedData),
    () => decompressWithNodeJS(compressedData),
    () => decompressWithPako(compressedData)
  ]
  
  let lastError: Error | undefined
  
  for (const method of decompressMethods) {
    try {
      const result = await method()
      return {
        data: result,
        detectedFormat,
        originalSize: compressedData.length,
        decompressedSize: new TextEncoder().encode(result).length
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown decompression error')
      // Continue to next method
    }
  }
  
  // All methods failed
  throw new UnifiedCompressionError(
    `All decompression methods failed. Last error: ${lastError?.message || 'Unknown error'}`,
    'decompress',
    detectedFormat,
    lastError
  )
}

/**
 * Decompress using Web API DecompressionStream (primary method)
 */
async function decompressWithWebAPI(compressedData: Uint8Array): Promise<string> {
  try {
    const decompressionStream = new DecompressionStream('gzip')
    const writer = decompressionStream.writable.getWriter()
    const reader = decompressionStream.readable.getReader()
    
    // Start decompression
    const writePromise = writer.write(compressedData).then(() => writer.close())
    
    // Read decompressed data
    const chunks: Uint8Array[] = []
    let totalSize = 0
    
    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        totalSize += value.length
      }
    })()
    
    await Promise.all([writePromise, readPromise])
    
    // Combine chunks
    const decompressedData = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of chunks) {
      decompressedData.set(chunk, offset)
      offset += chunk.length
    }
    
    return new TextDecoder().decode(decompressedData)
    
  } catch (error) {
    throw new Error(`Web API decompression failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Decompress using Node.js zlib (fallback for Node.js compressed data)
 */
async function decompressWithNodeJS(compressedData: Uint8Array): Promise<string> {
  // Only attempt in Node.js environment
  if (typeof process === 'undefined' || process.env.NEXT_RUNTIME === 'edge' || typeof window !== 'undefined') {
    throw new Error('Node.js zlib not available in this environment')
  }
  
  try {
    const { promisify } = await import('util')
    const { gunzip } = await import('zlib')
    const gunzipAsync = promisify(gunzip)
    
    const decompressed = await gunzipAsync(Buffer.from(compressedData))
    return decompressed.toString()
    
  } catch (error) {
    throw new Error(`Node.js zlib decompression failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Decompress using pako library (fallback for pako compressed data)
 */
async function decompressWithPako(compressedData: Uint8Array): Promise<string> {
  try {
    // Dynamic import to avoid bundling issues
    const pako = await import('pako')
    return pako.ungzip(compressedData, { to: 'string' })
    
  } catch (error) {
    throw new Error(`Pako decompression failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Utility function to validate JSON after decompression
 */
export function validateAndParseJSON<T = any>(jsonString: string): T {
  try {
    return JSON.parse(jsonString)
  } catch (error) {
    throw new UnifiedCompressionError(
      `Invalid JSON after decompression: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'decompress',
      undefined,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * High-level helper: Compress and return ready-to-store data
 */
export async function compressForStorage(data: any): Promise<{
  compressedData: Uint8Array
  metadata: {
    format: CompressionFormat
    originalSize: number
    compressedSize: number
    compressionRatio: number
  }
}> {
  const result = await compressData(data)
  return {
    compressedData: result.data,
    metadata: {
      format: result.format,
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      compressionRatio: result.compressionRatio
    }
  }
}

/**
 * High-level helper: Decompress and parse JSON in one step
 */
export async function decompressAndParseJSON<T = any>(compressedData: Uint8Array): Promise<{
  data: T
  metadata: {
    detectedFormat: CompressionFormat
    originalSize: number
    decompressedSize: number
  }
}> {
  const decompressResult = await decompressData(compressedData)
  const parsedData = validateAndParseJSON<T>(decompressResult.data)
  
  return {
    data: parsedData,
    metadata: {
      detectedFormat: decompressResult.detectedFormat,
      originalSize: decompressResult.originalSize,
      decompressedSize: decompressResult.decompressedSize
    }
  }
}