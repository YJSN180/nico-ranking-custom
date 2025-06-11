// Cloudflare Workers型定義

export interface KVNamespace {
  get(key: string, options?: KVGetOptions<"text">): Promise<string | null>
  get(key: string, options: KVGetOptions<"json">): Promise<any | null>
  get(key: string, options: KVGetOptions<"arrayBuffer">): Promise<ArrayBuffer | null>
  get(key: string, options: KVGetOptions<"stream">): Promise<ReadableStream | null>
  
  getWithMetadata<Metadata = unknown>(
    key: string,
    options?: KVGetOptions<"text">
  ): Promise<KVValueWithMetadata<string, Metadata>>
  getWithMetadata<Metadata = unknown>(
    key: string,
    options: KVGetOptions<"json">
  ): Promise<KVValueWithMetadata<any, Metadata>>
  getWithMetadata<Metadata = unknown>(
    key: string,
    options: KVGetOptions<"arrayBuffer">
  ): Promise<KVValueWithMetadata<ArrayBuffer, Metadata>>
  getWithMetadata<Metadata = unknown>(
    key: string,
    options: KVGetOptions<"stream">
  ): Promise<KVValueWithMetadata<ReadableStream, Metadata>>
  
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: KVPutOptions
  ): Promise<void>
  
  delete(key: string): Promise<void>
  
  list(options?: KVListOptions): Promise<KVListResult>
}

export interface KVGetOptions<Type extends string> {
  type?: Type
  cacheTtl?: number
}

export interface KVPutOptions {
  expiration?: number
  expirationTtl?: number
  metadata?: any
}

export interface KVListOptions {
  prefix?: string
  limit?: number
  cursor?: string
}

export interface KVListResult {
  keys: Array<{ name: string; expiration?: number; metadata?: any }>
  list_complete: boolean
  cursor?: string
}

export interface KVValueWithMetadata<Value, Metadata> {
  value: Value | null
  metadata: Metadata | null
}

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void
  passThroughOnException(): void
}

export interface CacheStorage {
  default: Cache
}

declare global {
  const caches: CacheStorage
}