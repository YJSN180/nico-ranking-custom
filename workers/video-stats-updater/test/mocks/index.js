// Mock data for testing

export const mockRankingMetadata = {
  version: 1,
  updatedAt: '2024-06-22T12:00:00Z',
  tagsByGenrePeriod: {
    'all/24h': {
      tags: [],
      updatedAt: '2024-06-22T12:00:00Z'
    },
    'all/hour': {
      tags: [],
      updatedAt: '2024-06-22T12:00:00Z'
    },
    'anime/24h': {
      tags: ['アニメ', 'MAD'],
      updatedAt: '2024-06-22T12:00:00Z'
    },
    'anime/hour': {
      tags: ['アニメ', 'MAD'],
      updatedAt: '2024-06-22T12:00:00Z'
    },
    'music/24h': {
      tags: [],
      updatedAt: '2024-06-22T12:00:00Z'
    },
    'music/hour': {
      tags: [],
      updatedAt: '2024-06-22T12:00:00Z'
    }
  }
};

export const mockRankingData = {
  items: [
    { id: 'sm1', title: 'Test Video 1' },
    { id: 'sm2', title: 'Test Video 2' },
  ],
  popularTags: ['test', 'video'],
  tags: {},
  metadata: {
    version: 1,
    updatedAt: '2024-06-22T12:00:00Z',
    genre: 'all',
    period: '24h'
  }
};

export const mockRankingDataHour = {
  items: [
    { id: 'sm2', title: 'Test Video 2' },
    { id: 'sm3', title: 'Test Video 3' },
  ],
  popularTags: ['test', 'new'],
  tags: {},
  metadata: {
    version: 1,
    updatedAt: '2024-06-22T12:00:00Z',
    genre: 'all',
    period: 'hour'
  }
};

export const mockVideoStats = {
  sm1: {
    viewCounter: 1000,
    commentCounter: 50,
    mylistCounter: 20,
    likeCounter: 100,
    tags: ['test', 'video'],
  },
  sm2: {
    viewCounter: 2000,
    commentCounter: 100,
    mylistCounter: 40,
    likeCounter: 200,
    tags: ['test', 'popular'],
  },
  sm3: {
    viewCounter: 500,
    commentCounter: 25,
    mylistCounter: 10,
    likeCounter: 50,
    tags: ['test', 'new'],
  },
};

export const mockEmptyRankingData = {
  items: [],
  popularTags: [],
  tags: {},
  metadata: {
    version: 1,
    updatedAt: '2024-06-22T12:00:00Z',
    genre: 'music',
    period: '24h'
  }
};

// Helper to create mock R2 object
export function createMockR2Object(data) {
  return {
    text: async () => JSON.stringify(data),
    json: async () => data,
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(data)).buffer,
    blob: async () => new Blob([JSON.stringify(data)], { type: 'application/json' }),
  };
}

async function gzipBytes(value) {
  const compressedStream = new Blob([value])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));

  return new Uint8Array(await new Response(compressedStream).arrayBuffer());
}

export async function createStoredMockR2Object(data, options = {}) {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
  const body = options.gzip
    ? await gzipBytes(jsonString)
    : new TextEncoder().encode(jsonString);

  return {
    __mockR2Object: true,
    body,
    httpMetadata: options.contentEncoding
      ? { contentEncoding: options.contentEncoding }
      : options.httpMetadata,
    contentType: 'application/json',
  };
}

// Helper to create mock fetch response
export function createMockResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
