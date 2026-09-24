// Next.js サーバー側から KV の lqng 設定・判定テーブルを読む
// - サイト側（検索・SSR の合流）: getLqngConfig / getLqngVerdicts。成功した値だけを 60 秒メモリキャッシュし、
//   読み取りに失敗したら直前の成功値を返す（無ければ「自動 NG なし」で継続）。失敗の結果はキャッシュしない。
// - 管理 API（設定・許可リストの書き込み）: readLqngConfigStrict / readLqngVerdictsStrict。キャッシュを通さず、
//   未設定（404）と読み取り失敗を区別して、失敗は例外にする（既定値を土台に書き込まない）。
// 書き込みは Worker（判定テーブル）と管理画面 API（設定・許可リスト）だけが行う。
import { kv } from '../simple-kv'
import { LQNG_KV_KEYS, normalizeLqngConfig, normalizeLqngVerdicts } from './config'
import { DEFAULT_LQNG_CONFIG, EMPTY_LQNG_VERDICTS, type LqngConfig, type LqngVerdicts } from './types'

const CACHE_TTL_MS = 60_000
/** 読み取りに失敗したあと、KV を読み直さずに直前の成功値を返す間隔（障害中に KV を叩き続けない） */
const RETRY_AFTER_FAILURE_MS = 10_000

export interface LqngLoadResult<T> {
  value: T
  /** false なら読み取りに失敗し、直前の成功値（無ければ既定値）で代替した */
  ok: boolean
}

interface Slot<T> {
  cached: { value: T; fetchedAt: number } | null
  /** 直前に読み取りに成功した値（失敗時の代替。キャッシュの無効化では消さない） */
  lastGood: T | null
  /** この時刻までは KV を読み直さない（直前の成功値がある失敗のあとだけ設定する） */
  retryAt: number
}

const configSlot: Slot<LqngConfig> = { cached: null, lastGood: null, retryAt: 0 }
const verdictsSlot: Slot<LqngVerdicts> = { cached: null, lastGood: null, retryAt: 0 }

/** 環境変数によるキルスイッチ（'false' で自動 NG の合流とリクエスト時ルールを止める） */
export function isLqngEnabled(): boolean {
  return process.env.LQNG_ENABLED !== 'false'
}

/** 次の読み取りで KV を読み直させる（直前の成功値は失敗時の代替として残す） */
export function invalidateLqngCache(): void {
  configSlot.cached = null
  configSlot.retryAt = 0
  verdictsSlot.cached = null
  verdictsSlot.retryAt = 0
}

/** テスト用: キャッシュと直前の成功値をすべて捨てる */
export function resetLqngServerState(): void {
  invalidateLqngCache()
  configSlot.lastGood = null
  verdictsSlot.lastGood = null
}

function cacheEnabled(): boolean {
  return process.env.NODE_ENV !== 'test'
}

const defaultConfig = (): LqngConfig => ({ ...DEFAULT_LQNG_CONFIG, allowlist: { authorIds: [], videoIds: [] }, freq: { ...DEFAULT_LQNG_CONFIG.freq } })

const emptyVerdicts = (): LqngVerdicts => ({ ...EMPTY_LQNG_VERDICTS, authors: {}, videos: {} })

async function readConfig(attempts?: number): Promise<LqngConfig> {
  const raw = await kv.getStrict<unknown>(LQNG_KV_KEYS.config, { attempts })
  return raw === null ? defaultConfig() : normalizeLqngConfig(raw)
}

async function readVerdicts(attempts?: number): Promise<LqngVerdicts> {
  const raw = await kv.getStrict<unknown>(LQNG_KV_KEYS.verdicts, { attempts })
  return raw === null ? emptyVerdicts() : normalizeLqngVerdicts(raw)
}

/** 管理 API 用: キャッシュを通さずに設定を読む。未設定（404）は既定値、読み取り失敗は例外 */
export function readLqngConfigStrict(): Promise<LqngConfig> {
  return readConfig()
}

/** 管理 API 用: キャッシュを通さずに判定テーブルを読む。未設定は空、読み取り失敗は例外 */
export function readLqngVerdictsStrict(): Promise<LqngVerdicts> {
  return readVerdicts()
}

async function load<T>(slot: Slot<T>, read: (attempts?: number) => Promise<T>, fallback: () => T): Promise<LqngLoadResult<T>> {
  const now = Date.now()
  if (cacheEnabled() && slot.cached && now - slot.cached.fetchedAt < CACHE_TTL_MS) return { value: slot.cached.value, ok: true }
  if (cacheEnabled() && slot.lastGood !== null && now < slot.retryAt) return { value: slot.lastGood, ok: false }
  try {
    // 直前の成功値があれば 1 回だけ試し、失敗したらすぐそれを返す（リクエストを再試行の待ちに巻き込まない）
    const value = await read(slot.lastGood !== null ? 1 : undefined)
    slot.lastGood = value
    slot.retryAt = 0
    if (cacheEnabled()) slot.cached = { value, fetchedAt: Date.now() }
    return { value, ok: true }
  } catch {
    if (slot.lastGood !== null) {
      slot.retryAt = Date.now() + RETRY_AFTER_FAILURE_MS
      return { value: slot.lastGood, ok: false }
    }
    return { value: fallback(), ok: false }
  }
}

export function loadLqngConfig(): Promise<LqngLoadResult<LqngConfig>> {
  return load(configSlot, readConfig, defaultConfig)
}

export function loadLqngVerdicts(): Promise<LqngLoadResult<LqngVerdicts>> {
  return load(verdictsSlot, readVerdicts, emptyVerdicts)
}

export async function getLqngConfig(): Promise<LqngConfig> {
  return (await loadLqngConfig()).value
}

export async function getLqngVerdicts(): Promise<LqngVerdicts> {
  return (await loadLqngVerdicts()).value
}

/** 管理画面 API が設定を保存するときに使う。updatedAt（版番号）を更新した保存値を返し、キャッシュを捨てる */
export async function saveLqngConfig(config: LqngConfig): Promise<LqngConfig> {
  const saved: LqngConfig = { ...config, updatedAt: new Date().toISOString() }
  invalidateLqngCache()
  await kv.set(LQNG_KV_KEYS.config, saved)
  invalidateLqngCache()
  return saved
}
