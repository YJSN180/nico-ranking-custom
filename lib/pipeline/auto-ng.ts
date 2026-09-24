// 粗悪コンテンツ自動NG（lib/lqng）を、パイプラインで公開前に当てるための読み取り。
// - KV の読み方は手動・派生 NG（update-ranking-parallel-v2 の getNGList）と同じ（同じ名前空間・Bearer 認証の REST、
//   fetchChecked の 1 回 20 秒・再試行 5 回・待ち 180 秒まで）。
// - 当てるのは確定した NG（status が ng）の動画 ID と投稿者 ID から、許可リストを除いたもの。
//   保留（hold）は期限付きの仮の判定で、公開データは次の更新まで残るため焼き込まない（サイトはリクエストごとに当てる）。
// - 読めない・壊れているときは自動NG なしで公開を続ける（サイトもリクエストのたびに当てており、公開を止めるほうが影響が大きい）。
//   状態を返し、ログにはキー名や ID を出さない。
import { fetchChecked, HttpFailure } from './retry'
import type { RankingPeriod } from './run-update'
import { isLqngVerdictsShape, LQNG_KV_KEYS, normalizeLqngConfig, normalizeLqngVerdicts } from '../lqng/config'
import { collectAutoNg } from '../lqng/merge'
import type { AutoNgSets, LqngVerdicts } from '../lqng/types'

/**
 * - applied: 当てた（該当が 0 件でも applied）
 * - disabled: 設定が無い・無効
 * - missing: 判定表のキーが無い（404）
 * - invalid: 判定表の形が壊れている（空として扱った）
 * - unavailable: 読み取りに失敗した（再試行ののち）
 */
export type AutoNgStatus = 'applied' | 'disabled' | 'missing' | 'invalid' | 'unavailable'

export interface PipelineAutoNg {
  status: AutoNgStatus
  sets: AutoNgSets
}

/** KV の値を読む。キーが無ければ null、JSON でなければ文字列のまま返す。読めなければ例外 */
export type KvJsonRead = (key: string) => Promise<unknown>

/** 自動NG で除いた件数。ranking は本体ランキング、tags はタグ別ランキングの合計 */
export interface AutoNgExcluded {
  ranking: number
  tags: number
}

export type AutoNgExcludedByPeriod = Record<RankingPeriod, AutoNgExcluded>

export function emptyAutoNgExcluded(): AutoNgExcludedByPeriod {
  return { '24h': { ranking: 0, tags: 0 }, hour: { ranking: 0, tags: 0 } }
}

const none = (status: AutoNgStatus): PipelineAutoNg => ({ status, sets: { authorIds: [], videoIds: [] } })

export function createKvJsonReader(env: Record<string, string | undefined> = process.env): KvJsonRead {
  return async (key) => {
    const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_KV_NAMESPACE_ID: namespace, CLOUDFLARE_API_TOKEN: token } = env
    if (!account || !namespace || !token) throw new Error('Missing KV credentials')
    let response: Response
    try {
      response = await fetchChecked(
        `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
    } catch (error) {
      if (error instanceof HttpFailure && error.status === 404) return null
      throw error
    }
    const body = await response.text()
    try {
      return JSON.parse(body)
    } catch {
      return body
    }
  }
}

/** 失敗の種類だけを返す（URL・キー名はログに出さない） */
function describeFailure(error: unknown): string {
  if (error instanceof HttpFailure) return `http_${error.status}`
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout'
    return error instanceof TypeError ? 'network' : error.name
  }
  return 'unknown'
}

/** 確定した NG の動画だけを残す（保留・解放は落とす）。形の崩れた項目はサイトと同じく例外になる */
function confirmedOnly(verdicts: LqngVerdicts): LqngVerdicts {
  return { ...verdicts, videos: Object.fromEntries(Object.entries(verdicts.videos).filter(([, v]) => v.status === 'ng')) }
}

/** 設定と判定表を読み、公開前に当てる自動NG を返す。例外は投げない */
export async function loadPipelineAutoNg(read: KvJsonRead, now: Date = new Date()): Promise<PipelineAutoNg> {
  const [configRead, verdictsRead] = await Promise.allSettled([read(LQNG_KV_KEYS.config), read(LQNG_KV_KEYS.verdicts)])
  // 設定が読めなければ許可リストも分からないので当てない
  if (configRead.status === 'rejected') {
    console.warn(`[Auto NG] Could not read the settings (${describeFailure(configRead.reason)}); publishing without auto NG`)
    return none('unavailable')
  }
  const config = normalizeLqngConfig(configRead.value)
  if (!config.enabled) return none('disabled')
  if (verdictsRead.status === 'rejected') {
    console.warn(`[Auto NG] Could not read the verdict table (${describeFailure(verdictsRead.reason)}); publishing without auto NG`)
    return none('unavailable')
  }
  const raw = verdictsRead.value
  if (raw === null) {
    console.warn('[Auto NG] No verdict table is stored; publishing without auto NG')
    return none('missing')
  }
  const malformed = (): PipelineAutoNg => {
    console.warn('[Auto NG] The verdict table is malformed and treated as empty; publishing without auto NG')
    return none('invalid')
  }
  if (!isLqngVerdictsShape(raw)) return malformed()
  try {
    // 許可リストの扱いはサイトの合流（lib/ng-list-server.ts）と同じ collectAutoNg
    return { status: 'applied', sets: collectAutoNg(confirmedOnly(normalizeLqngVerdicts(raw)), config, now) }
  } catch {
    return malformed()
  }
}
