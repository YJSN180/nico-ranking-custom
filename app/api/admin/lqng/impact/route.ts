// 設定の影響確認（読み取りだけ。KV に書かない）: 下書きの設定が、公開中のランキングの何本に一致するかを返す。
// 下書きを本文で受けるため POST にする（URL に照合語を載せない）。認証と CSRF 対策（同一オリジン・JSON だけ。
// middleware）は他の管理 API と同じ。許可リストは下書きでなく KV の現在の値を使う（保存でも下書きから変えない）
import { NextResponse, type NextRequest } from 'next/server'
import { normalizeLqngConfig, validateLqngConfigInput } from '@/lib/lqng/config'
import { evaluateLqngImpact } from '@/lib/lqng/impact'
import { readLqngConfigStrict } from '@/lib/lqng/server'
import type { LqngConfig } from '@/lib/lqng/types'
import type { RankingItem } from '@/types/ranking'
import { isAdminAuthenticated, kvUnavailable, unauthorized, withNoStore } from '../_shared'

export const dynamic = 'force-dynamic'

/** 評価するランキング（総合の 24 時間と毎時。サイトの入口で、1 回の確認で読むのは 2 本） */
const IMPACT_GENRE = 'all'
const IMPACT_PERIODS = ['24h', 'hour'] as const
const RANKING_TIMEOUT_MS = 10_000

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const isRankingItem = (v: unknown): v is RankingItem => isRecord(v) && typeof v.id === 'string' && typeof v.title === 'string'

/**
 * 公開中のランキングを読む。SSR や /api/ranking/full と同じく同一オリジンの /api/ranking を通す
 * （本番は 301 でゲートウェイに届き、R2 の公開中の世代を返す。ゲートウェイを直に読むと Cloudflare の保護で 403 になる）
 */
async function fetchPublishedRanking(origin: string, period: (typeof IMPACT_PERIODS)[number]): Promise<RankingItem[]> {
  const url = new URL('/api/ranking', origin)
  url.searchParams.set('genre', IMPACT_GENRE)
  url.searchParams.set('period', period)
  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate, br' },
    cache: 'no-store',
    signal: AbortSignal.timeout(RANKING_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`ranking_http_${response.status}`)
  const data: unknown = await response.json()
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error('ranking_invalid_response')
  return data.items.filter(isRankingItem)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAdminAuthenticated(request)) return unauthorized()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return withNoStore(NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }))
  }
  if (!isRecord(body)) return withNoStore(NextResponse.json({ error: 'Invalid config format' }, { status: 400 }))
  // 保存できない下書き（範囲外の数値・短すぎる照合語）は、保存と同じ理由で断る
  const problems = validateLqngConfigInput(body)
  if (problems.length > 0) return withNoStore(NextResponse.json({ error: 'Invalid config', problems }, { status: 400 }))
  let allowlist: LqngConfig['allowlist']
  try {
    allowlist = (await readLqngConfigStrict()).allowlist
  } catch (error) {
    console.error('Failed to read lqng config for the impact check:', error)
    return kvUnavailable()
  }
  let items: RankingItem[]
  try {
    const lists = await Promise.all(IMPACT_PERIODS.map((period) => fetchPublishedRanking(request.nextUrl.origin, period)))
    items = lists.flat()
  } catch (error) {
    console.error('Failed to read the published ranking for the impact check:', error)
    return withNoStore(NextResponse.json({ error: 'Ranking unavailable' }, { status: 502 }))
  }
  return withNoStore(NextResponse.json(evaluateLqngImpact(items, { ...normalizeLqngConfig(body), allowlist })))
}
