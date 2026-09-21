// Test helper functions
import { gzipSync } from 'zlib';

export function setupMockBindings(env) {
  // Mock R2 bucket
  const r2Storage = new Map();
  const etags = new Map();
  let version = 0;
  env.R2_BUCKET = {
    get: vi.fn(async (key) => {
      const data = r2Storage.get(key);
      if (!data) {
        return null;
      }

      if (data?.__mockR2Object) {
        return data;
      }

      return { ...createMockR2Object(data), etag: etags.get(key) || 'fixture' };
    }),
    put: vi.fn(async (key, value, options) => {
      if (options?.onlyIf?.etagDoesNotMatch === '*' && r2Storage.has(key)) return null;
      if (options?.onlyIf?.etagMatches && (etags.get(key) || 'fixture') !== options.onlyIf.etagMatches) return null;
      r2Storage.set(key, value);
      const etag = String(++version);
      etags.set(key, etag);
      return { etag };
    }),
    list: vi.fn(async () => ({
      objects: Array.from(r2Storage.keys()).map((key) => ({ key })),
    })),
    _storage: r2Storage, // Expose for testing
  };

  // Mock KV namespace
  const kvStorage = new Map();
  env.STATS_KV = {
    get: vi.fn(async (key, type) => {
      const value = kvStorage.get(key);
      return value ? (type === 'json' ? JSON.parse(value) : value) : null;
    }),
    put: vi.fn(async (key, value) => {
      kvStorage.set(key, value);
    }),
    delete: vi.fn(async (key) => {
      kvStorage.delete(key);
    }),
    list: vi.fn(async () => ({
      keys: Array.from(kvStorage.keys()).map((name) => ({ name })),
    })),
    _storage: kvStorage, // Expose for testing
  };

  return env;
}

// Helper to create R2 object from JSON
export function createMockR2Object(data, options = {}) {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
  const buffer = options.gzip
    ? gzipSync(Buffer.from(jsonString, 'utf-8'))
    : Buffer.from(jsonString, 'utf-8');

  return {
    __mockR2Object: true,
    httpMetadata: options.contentEncoding ? { contentEncoding: options.contentEncoding } : undefined,
    text: async () => jsonString,
    json: async () => JSON.parse(jsonString),
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    blob: async () => new Blob([jsonString], { type: 'application/json' }),
  };
}

// Setup mock for Snapshot API
export function setupSnapshotAPIMock(mockResponses = {}) {
  global.fetch = vi.fn(async (url, options) => {
    const urlString = typeof url === 'string' ? url : url.toString();
    
    // Mock Snapshot API responses
    if (urlString.includes('snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search')) {
      const urlParams = new URL(urlString).searchParams;
      const jsonFilterParam = urlParams.get('jsonFilter');
      
      // Extract video IDs from jsonFilter
      let videoIds = [];
      if (jsonFilterParam) {
        try {
          const jsonFilter = JSON.parse(jsonFilterParam);
          if (jsonFilter.filters && Array.isArray(jsonFilter.filters)) {
            videoIds = jsonFilter.filters
              .filter(f => f.field === 'contentId' && f.value)
              .map(f => f.value);
          }
        } catch (e) {
          console.error('Failed to parse jsonFilter:', e);
        }
      }
      
      const response = mockResponses[videoIds.join(',')] || { data: [] };
      
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Default response
    return new Response('Not found', { status: 404 });
  });
}

// Wait for all promises to resolve
export async function flushPromises() {
  await new Promise(resolve => setImmediate(resolve));
}

// Extract unique video IDs from ranking data
export function extractUniqueVideoIds(genreData) {
  const videoIds = new Set();
  
  ['24h', 'hour'].forEach(period => {
    const items = genreData[period]?.items || [];
    items.forEach(item => videoIds.add(item.id));
  });
  
  return Array.from(videoIds);
}
