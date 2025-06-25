/**
 * キャッシュユーティリティ関数
 * 動的TTL計算とETag管理
 */

export interface DynamicTTLResult {
  secondsUntilUpdate: number
  workersTTL: number
  cdnTTL: number
  browserTTL: number
  cacheControl: string
  cdnCacheControl: string
}

/**
 * 次の更新時刻までの動的TTLを計算
 * 更新時刻: 毎時5分と25分
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