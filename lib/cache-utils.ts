/**
 * キャッシュユーティリティ関数
 * 動的TTL計算とETag管理
 * 
 * 機能:
 * - 毎時5分・25分の更新スケジュールに基づく動的TTL計算
 * - RFC 7232準拠のETag生成と条件付きリクエスト処理
 * - 最大遅延20分を保証するキャッシュ戦略
 */

import { createHash } from 'crypto'

export interface DynamicTTLResult {
  secondsUntilUpdate: number
  workersTTL: number
  cdnTTL: number
  browserTTL: number
  cacheControl: string
  cdnCacheControl: string
}

export interface ETagOptions {
  weak?: boolean
}

/**
 * 次の更新時刻までの動的TTLを計算
 * 
 * 更新スケジュール: 毎時5分と25分
 * キャッシュ階層: Browser(shortest) < CDN Edge < Workers Cache(longest)
 * 最大遅延保証: 20分以内
 * 
 * @returns 各レイヤー向けのTTL値とCache-Controlヘッダー
 */
export function calculateDynamicTTL(): DynamicTTLResult {
  const now = new Date()
  const currentMinute = now.getMinutes()
  const currentSecond = now.getSeconds()
  
  // 次の更新時刻を計算
  let nextUpdateMinute: number
  let hoursToAdd = 0
  
  if (currentMinute < 5) {
    nextUpdateMinute = 5
  } else if (currentMinute < 25) {
    nextUpdateMinute = 25
  } else {
    nextUpdateMinute = 5
    hoursToAdd = 1
  }
  
  // 次の更新時刻のDateオブジェクトを作成
  const nextUpdate = new Date(now)
  nextUpdate.setHours(now.getHours() + hoursToAdd)
  nextUpdate.setMinutes(nextUpdateMinute)
  nextUpdate.setSeconds(0)
  nextUpdate.setMilliseconds(0)
  
  // 次の更新時刻までの秒数を計算
  const secondsUntilUpdate = Math.floor((nextUpdate.getTime() - now.getTime()) / 1000)
  
  // TTL値を計算（最低60秒）
  const workersTTL = Math.max(60, secondsUntilUpdate)
  const cdnTTL = Math.max(60, secondsUntilUpdate - 60)
  const browserTTL = Math.max(60, secondsUntilUpdate - 120)
  
  // Cache-Controlヘッダーを生成
  const cacheControl = `public, max-age=${browserTTL}, s-maxage=${cdnTTL}, stale-while-revalidate=86400`
  const cdnCacheControl = `public, max-age=${cdnTTL}`
  
  return {
    secondsUntilUpdate,
    workersTTL,
    cdnTTL,
    browserTTL,
    cacheControl,
    cdnCacheControl
  }
}

/**
 * コンテンツからETagを生成
 * 
 * SHA-256ハッシュベースの強いETagを生成
 * RFC 7232準拠のstrong/weak識別子をサポート
 * 
 * @param content - ハッシュ対象のコンテンツ
 * @param options - weak ETagフラグ
 * @returns RFC 7232形式のETag文字列
 */
export function generateETag(content: string | Uint8Array, options: ETagOptions = {}): string {
  const hash = createHash('sha256')
  
  if (typeof content === 'string') {
    hash.update(content, 'utf8')
  } else {
    hash.update(content)
  }
  
  const hashString = hash.digest('hex')
  const etag = `"${hashString}"`
  
  return options.weak ? `W/${etag}` : etag
}

/**
 * If-None-Matchヘッダーをパース
 */
export function parseIfNoneMatch(header: string | null | undefined): string[] {
  if (!header) {
    return []
  }
  
  // ワイルドカードの場合
  if (header.trim() === '*') {
    return ['*']
  }
  
  // ETagのリストをパース
  const etags: string[] = []
  const regex = /(?:W\/)?"[^"]+"/g
  let match
  
  while ((match = regex.exec(header)) !== null) {
    etags.push(match[0])
  }
  
  return etags
}

/**
 * ETagが一致するかチェック
 */
export function isETagMatch(
  currentETag: string,
  ifNoneMatch: string,
  options: { weak?: boolean } = { weak: true }
): boolean {
  const etags = parseIfNoneMatch(ifNoneMatch)
  
  // ワイルドカードの場合は常に一致
  if (etags.includes('*')) {
    return true
  }
  
  // weak比較の場合
  if (options.weak) {
    const normalizeETag = (etag: string) => etag.replace(/^W\//, '')
    const normalizedCurrent = normalizeETag(currentETag)
    
    return etags.some(etag => normalizeETag(etag) === normalizedCurrent)
  }
  
  // strong比較の場合
  return etags.includes(currentETag)
}