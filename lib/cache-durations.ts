/**
 * Unified cache duration configuration for Nico Ranking
 * 
 * Based on data update frequencies:
 * - Ranking data: Updated every hour at :25 (GitHub Actions)
 * - Video stats: Updated every 2 minutes (Cloudflare Workers)
 * - Popular tags: Part of ranking data, same update cycle
 */

export const CACHE_DURATIONS = {
  // Static assets - 24 hours (unchanged)
  STATIC_ASSETS: 86400,
  
  // Ranking data - 20 minutes (fresher data, 3x per hour update cycle)
  API_RANKING: 1200,         // 20m
  API_POPULAR_TAGS: 1200,    // 20m (same as ranking)
  ISR_REVALIDATE: 1200,      // 20m (Next.js ISR)
  CLIENT_CACHE: 1200,        // 20m (browser cache)
  
  // Video stats - 2 minutes (aligned with worker updates)
  API_VIDEO_STATS: 120,      // 2m
  
  // Stale-while-revalidate durations
  STALE_WHILE_REVALIDATE: {
    DEFAULT: 1200,           // 20m
    RANKING: 2400,           // 40m (2x cache duration)
    VIDEO_STATS: 180,        // 3m (1.5x update cycle)
  },
  
  // Edge/CDN cache durations
  CDN_CACHE: {
    RANKING: 1200,           // 20m
    VIDEO_STATS: 120,        // 2m
    STATIC: 86400,           // 24h
  }
} as const

// Helper function to generate cache headers
export function getCacheHeaders(type: 'ranking' | 'video-stats' | 'static' | 'popular-tags') {
  switch (type) {
    case 'ranking':
      return `public, max-age=${CACHE_DURATIONS.API_RANKING}, s-maxage=${CACHE_DURATIONS.CDN_CACHE.RANKING}, stale-while-revalidate=${CACHE_DURATIONS.STALE_WHILE_REVALIDATE.RANKING}`
    
    case 'video-stats':
      return `public, max-age=${CACHE_DURATIONS.API_VIDEO_STATS}, s-maxage=${CACHE_DURATIONS.CDN_CACHE.VIDEO_STATS}, stale-while-revalidate=${CACHE_DURATIONS.STALE_WHILE_REVALIDATE.VIDEO_STATS}`
    
    case 'popular-tags':
      return `public, max-age=${CACHE_DURATIONS.API_POPULAR_TAGS}, s-maxage=${CACHE_DURATIONS.CDN_CACHE.RANKING}, stale-while-revalidate=${CACHE_DURATIONS.STALE_WHILE_REVALIDATE.RANKING}`
    
    case 'static':
      return `public, max-age=${CACHE_DURATIONS.STATIC_ASSETS}, immutable`
    
    default:
      return `public, max-age=${CACHE_DURATIONS.API_RANKING}, s-maxage=${CACHE_DURATIONS.CDN_CACHE.RANKING}, stale-while-revalidate=${CACHE_DURATIONS.STALE_WHILE_REVALIDATE.DEFAULT}`
  }
}

// Export type for TypeScript
export type CacheDurationType = typeof CACHE_DURATIONS