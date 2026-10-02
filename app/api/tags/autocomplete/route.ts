import { NextRequest, NextResponse } from 'next/server'
import { TAG_SUGGEST_MAX_QUERY, TAG_SUGGEST_MIN_QUERY, normalizeTagQuery } from '@/workers/utils/tag-suggest'

/**
 * タグ候補 API（Next.js 版）
 * 本番の nico-rank.com では Worker（Green）が R2 の辞書から直接答える。ここに来るのはプレビューとローカル開発で、
 * 本番と同じ辞書・同じ照合の結果にするため、公開ゲートウェイの /api/tags/autocomplete を中継する
 */

export const preferredRegion = 'hnd1'

// 候補の件数（クライアントは 10 件を指定する）。不正な値は既定、大きすぎる値は上限に丸める（Green と同じ）
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const MAX_TAG_LENGTH = 100
const UPSTREAM_TIMEOUT_MS = 5_000
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX_ENTRIES = 200
// 中継した要求の印。上流が Vercel へ戻した場合（Blue 稼働時など）に、もう一度中継して循環しないようにする
const PROXY_HOP_HEADER = 'X-Tag-Suggest-Proxy'

interface UpstreamMetadata {
  source: string
  lastUpdated: string | null
  totalUniqueTags: number
}

interface CachedAnswer {
  suggestions: string[]
  metadata: UpstreamMetadata
  expiresAt: number
}

// 成功した上流の答えだけを、正規化したクエリと件数ごとに持つ（入れた順に古いものから捨てる）
const answers = new Map<string, CachedAnswer>()

function parseLimit(value: string | null): number {
  const limit = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

/** 中継先は固定（要求の Host などからは決めない）。本番以外はローカル開発も含めて Green の workers.dev */
function gatewayBase(): string {
  return process.env.VERCEL_ENV === 'production'
    ? process.env.RANKING_SSR_GATEWAY_URL || 'https://nico-rank.com'
    : 'https://nico-ranking-api-gateway-green.yjsn180180.workers.dev'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeSuggestions(value: unknown, limit: number): string[] | null {
  if (!Array.isArray(value)) return null
  const unique = new Set<string>()
  for (const tag of value) {
    if (unique.size >= limit) break
    if (typeof tag === 'string' && tag.length >= 1 && tag.length <= MAX_TAG_LENGTH) unique.add(tag)
  }
  return [...unique]
}

function readMetadata(value: unknown): UpstreamMetadata {
  const metadata = isRecord(value) ? value : {}
  const { source, lastUpdated, totalUniqueTags } = metadata
  return {
    source: typeof source === 'string' && source !== '' ? source : 'gateway',
    lastUpdated: typeof lastUpdated === 'string' && lastUpdated !== '' ? lastUpdated : null,
    totalUniqueTags: typeof totalUniqueTags === 'number' && Number.isFinite(totalUniqueTags) ? totalUniqueTags : 0,
  }
}

function readCache(key: string, now: number): CachedAnswer | undefined {
  const entry = answers.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= now) {
    answers.delete(key)
    return undefined
  }
  return entry
}

function writeCache(key: string, entry: CachedAnswer): void {
  answers.delete(key)
  while (answers.size >= CACHE_MAX_ENTRIES) {
    const oldest = answers.keys().next().value
    if (oldest === undefined) break
    answers.delete(oldest)
  }
  answers.set(key, entry)
}

function answer(query: string, limit: number, suggestions: string[], metadata: UpstreamMetadata): NextResponse {
  // 辞書が見つからない答えは Green と同じく短く持つ
  const cacheControl = metadata.source === 'tag-data-not-found' ? 'public, max-age=60' : 'public, max-age=300'
  return NextResponse.json(
    { query, suggestions, metadata: { total: suggestions.length, maxResults: limit, ...metadata } },
    { headers: { 'Cache-Control': cacheControl } },
  )
}

function upstreamError(query: string): NextResponse {
  return NextResponse.json(
    { query, suggestions: [], metadata: { total: 0, source: 'upstream-error' } },
    { status: 502, headers: { 'Cache-Control': 'no-store' } },
  )
}

/** 上流の答えを確かめて返す。使えない答えなら null（ログには利用者のクエリを残さない） */
async function fetchFromGateway(query: string, limit: number): Promise<Omit<CachedAnswer, 'expiresAt'> | null> {
  try {
    const upstreamUrl = new URL('/api/tags/autocomplete', gatewayBase())
    upstreamUrl.searchParams.set('q', query)
    upstreamUrl.searchParams.set('limit', String(limit))
    const response = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'nico-ranking-web/1.0',
        [PROXY_HOP_HEADER]: '1',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!response.ok) {
      await response.body?.cancel()
      console.warn('[Tag Autocomplete] Upstream responded with status', response.status)
      return null
    }
    const body: unknown = await response.json()
    const suggestions = isRecord(body) ? sanitizeSuggestions(body.suggestions, limit) : null
    if (!isRecord(body) || !suggestions) {
      console.warn('[Tag Autocomplete] Upstream answer has no suggestions array')
      return null
    }
    return { suggestions, metadata: readMetadata(body.metadata) }
  } catch (error) {
    console.warn('[Tag Autocomplete] Upstream request failed:', error instanceof Error ? error.name : 'unknown')
    return null
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const rawQuery = searchParams.get('q') || ''
  const query = rawQuery.trim()
  const limit = parseLimit(searchParams.get('limit'))

  // 短すぎる・長すぎるクエリは上流へ送らずに Green と同じ答えを返す
  if (query.length < TAG_SUGGEST_MIN_QUERY || query.length > TAG_SUGGEST_MAX_QUERY) {
    const source = query.length < TAG_SUGGEST_MIN_QUERY ? 'query-too-short' : 'query-too-long'
    return NextResponse.json(
      { query: rawQuery, suggestions: [], metadata: { total: 0, source } },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    )
  }

  // 自分が中継した要求が戻ってきたら、もう中継しない
  if (request.headers.has(PROXY_HOP_HEADER)) return upstreamError(rawQuery)

  const cacheKey = `${limit}:${normalizeTagQuery(query)}`
  const cached = readCache(cacheKey, Date.now())
  if (cached) return answer(rawQuery, limit, cached.suggestions, cached.metadata)

  const upstream = await fetchFromGateway(query, limit)
  if (!upstream) return upstreamError(rawQuery)
  if (upstream.metadata.source !== 'tag-data-not-found') {
    writeCache(cacheKey, { ...upstream, expiresAt: Date.now() + CACHE_TTL_MS })
  }
  return answer(rawQuery, limit, upstream.suggestions, upstream.metadata)
}
