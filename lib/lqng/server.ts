// Next.js サーバー側から KV の lqng 設定・判定テーブルを読む（60 秒メモリキャッシュ）
// 書き込みは Worker（判定テーブル）と管理画面 API（設定・許可リスト）だけが行う。
// 読み取り失敗時は「自動 NG なし」で継続し、サービスを落とさない。
import { kv } from '../simple-kv'
import { LQNG_KV_KEYS, normalizeLqngConfig, normalizeLqngVerdicts } from './config'
import { DEFAULT_LQNG_CONFIG, EMPTY_LQNG_VERDICTS, type LqngConfig, type LqngVerdicts } from './types'

const CACHE_TTL_MS = 60_000

interface Cached<T> {
  value: T
  fetchedAt: number
}

let configCache: Cached<LqngConfig> | null = null
let verdictsCache: Cached<LqngVerdicts> | null = null

/** 環境変数によるキルスイッチ（'false' で自動 NG の合流とリクエスト時ルールを止める） */
export function isLqngEnabled(): boolean {
  return process.env.LQNG_ENABLED !== 'false'
}

export function invalidateLqngCache(): void {
  configCache = null
  verdictsCache = null
}

function cacheEnabled(): boolean {
  return process.env.NODE_ENV !== 'test'
}

export async function getLqngConfig(): Promise<LqngConfig> {
  if (cacheEnabled() && configCache && Date.now() - configCache.fetchedAt < CACHE_TTL_MS) return configCache.value
  let value: LqngConfig
  try {
    const raw = await kv.get<unknown>(LQNG_KV_KEYS.config)
    value = raw ? normalizeLqngConfig(raw) : { ...DEFAULT_LQNG_CONFIG, allowlist: { authorIds: [], videoIds: [] }, freq: { ...DEFAULT_LQNG_CONFIG.freq } }
  } catch {
    value = { ...DEFAULT_LQNG_CONFIG, allowlist: { authorIds: [], videoIds: [] }, freq: { ...DEFAULT_LQNG_CONFIG.freq } }
  }
  if (cacheEnabled()) configCache = { value, fetchedAt: Date.now() }
  return value
}

export async function getLqngVerdicts(): Promise<LqngVerdicts> {
  if (cacheEnabled() && verdictsCache && Date.now() - verdictsCache.fetchedAt < CACHE_TTL_MS) return verdictsCache.value
  let value: LqngVerdicts
  try {
    const raw = await kv.get<unknown>(LQNG_KV_KEYS.verdicts)
    value = raw ? normalizeLqngVerdicts(raw) : { ...EMPTY_LQNG_VERDICTS, authors: {}, videos: {} }
  } catch {
    value = { ...EMPTY_LQNG_VERDICTS, authors: {}, videos: {} }
  }
  if (cacheEnabled()) verdictsCache = { value, fetchedAt: Date.now() }
  return value
}

/** 管理画面 API が設定を保存するときに使う（保存後にキャッシュを捨てる） */
export async function saveLqngConfig(config: LqngConfig): Promise<void> {
  invalidateLqngCache()
  await kv.set(LQNG_KV_KEYS.config, { ...config, updatedAt: new Date().toISOString() })
  invalidateLqngCache()
}
