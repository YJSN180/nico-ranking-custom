// /api/search 系の、インスタンスごとの軽い流量制限（トークンバケツ）。
// 本番は Cloudflare のゲートウェイを通るので、関数から見える送信元は Cloudflare のアドレスになる
// （Vercel はプロキシが付けた X-Forwarded-For を上書きし、元の IP を渡さない。x-real-ip も同じ値）。
// 利用者ごとには分けられないので、インスタンス全体として上流（ニコニコ）への問い合わせの急増だけを抑える。
// 利用者ごとの制限は本番のゲートウェイで行う。CDN のキャッシュに当たった呼び出しはここまで来ない。
import { NextResponse } from 'next/server'

export interface TokenBucket {
  /** 1 つ取る。取れたら 0、取れなければ次に取れるまでの秒数（1 以上） */
  take(now?: number): number
  /** 満杯に戻す（テスト用） */
  reset(): void
}

export function createTokenBucket(capacity: number, refillPerSecond: number): TokenBucket {
  let tokens = capacity
  let updatedAt: number | null = null
  return {
    take(now = Date.now()) {
      if (updatedAt !== null) tokens = Math.min(capacity, tokens + (Math.max(0, now - updatedAt) / 1000) * refillPerSecond)
      updatedAt = now
      if (tokens >= 1) {
        tokens -= 1
        return 0
      }
      return Math.max(1, Math.ceil((1 - tokens) / refillPerSecond))
    },
    reset() {
      tokens = capacity
      updatedAt = null
    },
  }
}

/** 検索（1 回で上流へ 10 回前後）: 30 回まで続けて受け、毎秒 3 回分ずつ戻す */
export const searchRateLimit = createTokenBucket(30, 3)

/** 検索結果の後付けの補完（投稿者情報・タグ。1 回で上流へ最大 25 回、検索 1 回につき数回呼ばれる）: 120 回まで、毎秒 12 回分 */
export const enrichmentRateLimit = createTokenBucket(120, 12)

/** 上限を超えたときの応答。CDN に置かない（置くと、上限が戻った後も同じ URL が 429 のままになる） */
export function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds), 'Cache-Control': 'no-store' } }
  )
}
