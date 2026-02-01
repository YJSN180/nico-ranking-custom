import type { RankingItem } from '@/types/ranking'
import {
  enrichRankingItemsWithTagDetails,
} from '@/lib/tag-fetcher-simple'

export type TagEnrichmentKind = 'main' | 'tag'
export type TagEnrichmentPeriod = '24h' | 'hour'

export interface TagEnrichmentContext {
  genre: string
  period: TagEnrichmentPeriod
  kind: TagEnrichmentKind
  tag?: string
}

export interface TagEnrichmentSettings {
  enabled: boolean
  enableForTagRankings: boolean
  maxVideos: number
  tagRankingsMaxVideos?: number | null
  allowedGenres: string[]
}

export function getTagEnrichmentSettingsFromEnv(): TagEnrichmentSettings {
  return {
    enabled: process.env.ENABLE_TAG_FETCHING === 'true',
    enableForTagRankings: process.env.TAG_FETCH_FOR_TAG_RANKINGS === 'true',
    maxVideos: parseInt(process.env.TAG_FETCH_MAX_VIDEOS || '1000', 10),
    tagRankingsMaxVideos: null,
    allowedGenres:
      process.env.TAG_FETCH_GENRES?.split(',').filter(Boolean) || [],
  }
}

function buildContextLabel(context: TagEnrichmentContext): string {
  if (context.kind === 'tag') {
    return `${context.genre}/tag/${context.tag || 'unknown'}/${context.period}`
  }
  return `${context.genre}/${context.period}`
}

export function createTagEnricher(settings: TagEnrichmentSettings) {
  return async function enrich(
    items: RankingItem[],
    context: TagEnrichmentContext,
  ): Promise<RankingItem[]> {
    if (!settings.enabled) return items
    if (
      settings.allowedGenres.length > 0 &&
      !settings.allowedGenres.includes(context.genre)
    ) {
      return items
    }
    if (context.kind === 'tag' && !settings.enableForTagRankings) {
      return items
    }
    if (items.length === 0) return items

    const limit =
      context.kind === 'tag'
        ? (settings.tagRankingsMaxVideos ?? items.length)
        : settings.maxVideos

    if (limit <= 0) return items

    const slice = items.slice(0, limit)
    const remainder = items.slice(limit)

    const label = buildContextLabel(context)
    try {
      const enriched = await enrichRankingItemsWithTagDetails(slice)
      return [...enriched, ...remainder]
    } finally {
      // Context tracking removed as setTagFetchContext was not implemented
    }
  }
}
