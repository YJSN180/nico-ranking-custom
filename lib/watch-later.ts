import type { RankingItem } from '@/types/ranking'

export const WATCH_LATER_STORAGE_KEY = 'watch-later-v1'
export const WATCH_LATER_UPDATED_EVENT = 'watchLaterUpdated'
const MAX_WATCH_LATER_ITEMS = 100

export interface WatchLaterSource {
  genre?: string
  period?: string
  tag?: string
}

export interface WatchLaterItem {
  id: string
  title: string
  thumbURL?: string
  authorName?: string
  url: string
  addedAt: string
  openedAt?: string
  sourceGenre?: string
  sourcePeriod?: string
  sourceTag?: string
}

export function getVideoWatchUrl(videoId: string): string {
  return `https://www.nicovideo.jp/watch/${videoId}`
}

function canUseStorage(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined'
    )
  } catch {
    return false
  }
}

function normalizeItems(value: unknown): WatchLaterItem[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is WatchLaterItem => {
      return (
        item &&
        typeof item === 'object' &&
        typeof (item as WatchLaterItem).id === 'string' &&
        typeof (item as WatchLaterItem).title === 'string'
      )
    })
    .map((item) => {
      const source = item as Partial<WatchLaterItem>
      return {
        id: item.id,
        title: item.title,
        thumbURL:
          typeof source.thumbURL === 'string' ? source.thumbURL : undefined,
        authorName:
          typeof source.authorName === 'string' ? source.authorName : undefined,
        url:
          typeof source.url === 'string'
            ? source.url
            : getVideoWatchUrl(item.id),
        addedAt:
          typeof source.addedAt === 'string'
            ? source.addedAt
            : new Date().toISOString(),
        openedAt:
          typeof source.openedAt === 'string' ? source.openedAt : undefined,
        sourceGenre:
          typeof source.sourceGenre === 'string'
            ? source.sourceGenre
            : undefined,
        sourcePeriod:
          typeof source.sourcePeriod === 'string'
            ? source.sourcePeriod
            : undefined,
        sourceTag:
          typeof source.sourceTag === 'string' ? source.sourceTag : undefined,
      }
    })
}

export function readWatchLaterItems(): WatchLaterItem[] {
  if (!canUseStorage()) return []

  try {
    const raw = window.localStorage.getItem(WATCH_LATER_STORAGE_KEY)
    if (!raw) return []
    return normalizeItems(JSON.parse(raw))
  } catch {
    return []
  }
}

function emitWatchLaterUpdated(items: WatchLaterItem[]): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(WATCH_LATER_UPDATED_EVENT, {
      detail: { items },
    }),
  )
}

export function writeWatchLaterItems(
  items: WatchLaterItem[],
): WatchLaterItem[] {
  if (!canUseStorage()) return []

  const normalized = normalizeItems(items).slice(0, MAX_WATCH_LATER_ITEMS)
  window.localStorage.setItem(
    WATCH_LATER_STORAGE_KEY,
    JSON.stringify(normalized),
  )
  emitWatchLaterUpdated(normalized)
  return normalized
}

export function createWatchLaterItem(
  video: RankingItem,
  source?: WatchLaterSource,
): WatchLaterItem {
  return {
    id: video.id,
    title: video.title,
    thumbURL: video.thumbURL,
    authorName: video.authorName,
    url: getVideoWatchUrl(video.id),
    addedAt: new Date().toISOString(),
    sourceGenre: source?.genre,
    sourcePeriod: source?.period,
    sourceTag: source?.tag,
  }
}

export function addWatchLaterItem(
  video: RankingItem,
  source?: WatchLaterSource,
): { added: boolean; item: WatchLaterItem; items: WatchLaterItem[] } {
  const current = readWatchLaterItems()
  const existing = current.find((item) => item.id === video.id)

  if (existing) {
    return { added: false, item: existing, items: current }
  }

  const item = createWatchLaterItem(video, source)
  const items = writeWatchLaterItems([item, ...current])
  return { added: true, item, items }
}

export function removeWatchLaterItem(videoId: string): WatchLaterItem[] {
  const nextItems = readWatchLaterItems().filter((item) => item.id !== videoId)
  return writeWatchLaterItems(nextItems)
}

export function clearWatchLaterItems(): WatchLaterItem[] {
  return writeWatchLaterItems([])
}

export function markWatchLaterItemOpened(videoId: string): WatchLaterItem[] {
  const openedAt = new Date().toISOString()
  const nextItems = readWatchLaterItems().map((item) =>
    item.id === videoId ? { ...item, openedAt } : item,
  )
  return writeWatchLaterItems(nextItems)
}
