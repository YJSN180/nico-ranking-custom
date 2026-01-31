import type { RankingGenre } from '@/types/ranking-config'
import type { RankingItem } from '@/types/ranking'
import type { KVRankingData } from '@/lib/cloudflare-kv'
import { collectRankingItems } from '@/lib/pipeline/collect-ranking-items'

export type RankingPeriod = '24h' | 'hour'
export type RankingKind = 'main' | 'tag'

export interface RankingContext {
  genre: RankingGenre
  period: RankingPeriod
  kind: RankingKind
  tag?: string
}

export interface RankingPageContext extends RankingContext {
  page: number
}

export interface RunUpdateConfig<T> {
  genres: RankingGenre[]
  periods: RankingPeriod[]
  targetCount: number
  maxPages: number
  periodDelayMs?: number
  pageDelayMs?: number
  dedupe?: boolean
  stopOnEmptyPage?: boolean
  stopWhenPageItemsLessThan?: number
  onError?: 'throw' | 'break'
  fetchPage: (
    genre: RankingGenre,
    period: RankingPeriod,
    tag: string | undefined,
    page: number,
  ) => Promise<{ items: T[]; popularTags?: string[] }>
  normalizeItems: (items: T[], context: RankingContext) => RankingItem[]
  filterItems: (
    items: RankingItem[],
    context: RankingContext,
  ) => Promise<{ filteredItems: RankingItem[]; newDerivedIds: string[] }>
  onDerivedIds?: (
    ids: string[],
    context: RankingPageContext,
  ) => Promise<void> | void
  onFetchError?: (error: unknown, context: RankingPageContext) => void
  includeTagRankings?: boolean
  tagTargetCount?: number
  tagMaxPages?: number
  tagBetweenDelayMs?: number
  tagPageDelayMs?: number
  tagDedupe?: boolean
  tagStopOnEmptyPage?: boolean
  tagStopWhenPageItemsLessThan?: number
  tagOnError?: 'throw' | 'break'
  popularTagsStrategy?: 'shared' | 'per-period'
  tagFetchOrder?: 'tag-first' | 'period-first'
  tagEnrichment?: (
    items: RankingItem[],
    context: RankingContext,
  ) => Promise<RankingItem[]>
}

export interface GenreRankingResult {
  genre: RankingGenre
  data: KVRankingData['genres'][string]
  hadErrors: boolean
}

export interface RunUpdateResult {
  genres: KVRankingData['genres']
  totalItems: number
  hadErrors: boolean
}

function pickSharedPopularTags(
  popularTagsByPeriod: Record<RankingPeriod, string[]>,
  periods: RankingPeriod[],
): string[] {
  for (const period of periods) {
    const tags = popularTagsByPeriod[period]
    if (tags && tags.length > 0) {
      return tags
    }
  }
  return []
}

async function collectWithContext<T>(
  config: RunUpdateConfig<T>,
  context: RankingContext,
  overrides?: {
    targetCount?: number
    maxPages?: number
    pageDelayMs?: number
    dedupe?: boolean
    stopOnEmptyPage?: boolean
    stopWhenPageItemsLessThan?: number
    onError?: 'throw' | 'break'
  },
): Promise<{ items: RankingItem[]; popularTags: string[] }> {
  const { items, popularTags } = await collectRankingItems({
    fetchPage: (page) =>
      config.fetchPage(context.genre, context.period, context.tag, page),
    normalizeItems: (items) => config.normalizeItems(items, context),
    filterItems: (items) => config.filterItems(items, context),
    onDerivedIds: config.onDerivedIds
      ? (ids, page) => config.onDerivedIds!(ids, { ...context, page })
      : undefined,
    onFetchError: config.onFetchError
      ? (error, page) => config.onFetchError!(error, { ...context, page })
      : undefined,
    targetCount: overrides?.targetCount ?? config.targetCount,
    maxPages: overrides?.maxPages ?? config.maxPages,
    pageDelayMs: overrides?.pageDelayMs ?? config.pageDelayMs,
    dedupe: overrides?.dedupe ?? config.dedupe,
    stopOnEmptyPage: overrides?.stopOnEmptyPage ?? config.stopOnEmptyPage,
    stopWhenPageItemsLessThan:
      overrides?.stopWhenPageItemsLessThan ?? config.stopWhenPageItemsLessThan,
    onError: overrides?.onError ?? config.onError,
  })

  return {
    items,
    popularTags: popularTags || [],
  }
}

async function maybeEnrichItems<T>(
  config: RunUpdateConfig<T>,
  items: RankingItem[],
  context: RankingContext,
): Promise<RankingItem[]> {
  if (!config.tagEnrichment) return items
  return config.tagEnrichment(items, context)
}

export async function buildGenreRanking<T>(
  config: RunUpdateConfig<T>,
  genre: RankingGenre,
): Promise<GenreRankingResult> {
  const data: KVRankingData['genres'][string] = {
    '24h': { items: [], popularTags: [], tags: {} },
    hour: { items: [], popularTags: [], tags: {} },
  }

  const popularTagsByPeriod: Record<RankingPeriod, string[]> = {
    '24h': [],
    hour: [],
  }

  let hadErrors = false

  for (const period of config.periods) {
    const context: RankingContext = { genre, period, kind: 'main' }
    try {
      const result = await collectWithContext(config, context)
      const enrichedItems = await maybeEnrichItems(
        config,
        result.items,
        context,
      )
      data[period] = {
        items: enrichedItems,
        popularTags: result.popularTags,
        tags: {},
      }
      popularTagsByPeriod[period] = result.popularTags
    } catch (error) {
      hadErrors = true
      data[period] = { items: [], popularTags: [], tags: {} }
    }

    if (
      config.periodDelayMs &&
      period !== config.periods[config.periods.length - 1]
    ) {
      await new Promise((resolve) => setTimeout(resolve, config.periodDelayMs))
    }
  }

  const popularTagsStrategy = config.popularTagsStrategy || 'per-period'
  const sharedPopularTags =
    popularTagsStrategy === 'shared'
      ? pickSharedPopularTags(popularTagsByPeriod, config.periods)
      : []

  for (const period of config.periods) {
    if (popularTagsStrategy === 'shared') {
      data[period].popularTags = sharedPopularTags
    }
  }

  const includeTagRankings = config.includeTagRankings ?? false
  if (includeTagRankings) {
    const tagFetchOrder = config.tagFetchOrder || 'period-first'

    if (popularTagsStrategy === 'shared' && sharedPopularTags.length > 0) {
      if (tagFetchOrder === 'tag-first') {
        for (
          let tagIndex = 0;
          tagIndex < sharedPopularTags.length;
          tagIndex += 1
        ) {
          const tag = sharedPopularTags[tagIndex]
          if (config.tagBetweenDelayMs) {
            await new Promise((resolve) =>
              setTimeout(resolve, config.tagBetweenDelayMs),
            )
          }
          for (const period of config.periods) {
            const context: RankingContext = {
              genre,
              period,
              kind: 'tag',
              tag,
            }
            try {
              const tagResult = await collectWithContext(config, context, {
                targetCount: config.tagTargetCount,
                maxPages: config.tagMaxPages,
                pageDelayMs: config.tagPageDelayMs,
                dedupe: config.tagDedupe,
                stopOnEmptyPage: config.tagStopOnEmptyPage,
                stopWhenPageItemsLessThan: config.tagStopWhenPageItemsLessThan,
                onError: config.tagOnError,
              })
              const enriched = await maybeEnrichItems(
                config,
                tagResult.items,
                context,
              )
              data[period].tags[tag] = enriched
            } catch {
              continue
            }
          }
        }
      } else {
        for (const period of config.periods) {
          for (
            let tagIndex = 0;
            tagIndex < sharedPopularTags.length;
            tagIndex += 1
          ) {
            const tag = sharedPopularTags[tagIndex]
            if (config.tagBetweenDelayMs) {
              await new Promise((resolve) =>
                setTimeout(resolve, config.tagBetweenDelayMs),
              )
            }
            const context: RankingContext = {
              genre,
              period,
              kind: 'tag',
              tag,
            }
            try {
              const tagResult = await collectWithContext(config, context, {
                targetCount: config.tagTargetCount,
                maxPages: config.tagMaxPages,
                pageDelayMs: config.tagPageDelayMs,
                dedupe: config.tagDedupe,
                stopOnEmptyPage: config.tagStopOnEmptyPage,
                stopWhenPageItemsLessThan: config.tagStopWhenPageItemsLessThan,
                onError: config.tagOnError,
              })
              const enriched = await maybeEnrichItems(
                config,
                tagResult.items,
                context,
              )
              data[period].tags[tag] = enriched
            } catch {
              continue
            }
          }
        }
      }
    }

    if (popularTagsStrategy === 'per-period') {
      for (const period of config.periods) {
        const tags = popularTagsByPeriod[period]
        if (!tags || tags.length === 0) continue
        for (let tagIndex = 0; tagIndex < tags.length; tagIndex += 1) {
          const tag = tags[tagIndex]
          if (config.tagBetweenDelayMs) {
            await new Promise((resolve) =>
              setTimeout(resolve, config.tagBetweenDelayMs),
            )
          }
          const context: RankingContext = {
            genre,
            period,
            kind: 'tag',
            tag,
          }
          try {
            const tagResult = await collectWithContext(config, context, {
              targetCount: config.tagTargetCount,
              maxPages: config.tagMaxPages,
              pageDelayMs: config.tagPageDelayMs,
              dedupe: config.tagDedupe,
              stopOnEmptyPage: config.tagStopOnEmptyPage,
              stopWhenPageItemsLessThan: config.tagStopWhenPageItemsLessThan,
              onError: config.tagOnError,
            })
            const enriched = await maybeEnrichItems(
              config,
              tagResult.items,
              context,
            )
            data[period].tags[tag] = enriched
          } catch {
            continue
          }
        }
      }
    }
  }

  return {
    genre,
    data,
    hadErrors,
  }
}

export async function buildRankingData<T>(
  config: RunUpdateConfig<T>,
): Promise<RunUpdateResult> {
  const genres: KVRankingData['genres'] = {}
  let totalItems = 0
  let hadErrors = false

  for (const genre of config.genres) {
    const result = await buildGenreRanking(config, genre)
    genres[genre] = result.data
    hadErrors = hadErrors || result.hadErrors

    totalItems += result.data['24h'].items.length
    totalItems += result.data.hour.items.length

    for (const tagItems of Object.values(result.data['24h'].tags || {})) {
      totalItems += tagItems.length
    }
    for (const tagItems of Object.values(result.data.hour.tags || {})) {
      totalItems += tagItems.length
    }
  }

  return {
    genres,
    totalItems,
    hadErrors,
  }
}
