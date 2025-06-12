/// <reference types="@cloudflare/workers-types" />

declare global {
  interface CacheStorage {
    default: Cache
  }
}