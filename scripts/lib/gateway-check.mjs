// 公開ゲートウェイのスモークチェック（scripts/check-admin-gateway.mjs から実行）の本体と、判定・再試行・診断出力。
// GitHub runner で npm ci なしに動かすため、依存パッケージを使わない。

export const SITE_ORIGIN = 'https://nico-rank.com'
export const SSR_PATHS = ['/', '/?genre=game&period=24h']
export const ADMIN_PATH = '/api/admin/ng-list'
// 偽装はせず、Cloudflare の Security Events で見分けられる名前を名乗る（static-asset-probe.mjs と同じ）
export const USER_AGENT = 'nico-ranking-verification/1.0'

// 失敗時に出してよいヘッダー。Cookie・Authorization・WWW-Authenticate などは出さない
export const DIAGNOSTIC_HEADERS = [
  'server',
  'cf-ray',
  'cf-mitigated',
  'cf-cache-status',
  'x-vercel-mitigated',
  'x-vercel-id',
  'x-vercel-cache',
  'content-type',
  'location',
  'x-router-version',
  'x-active-worker',
]

// デプロイ直後のゲートなので、配備した Worker の異常でも起きる失敗は再試行で合格にしない。
// 5xx（資源超過の error 1102 は 503）は旧スクリプトと同じく 1 回で失敗にする。
// 403 は WAF・Bot 対策の拒否で、繰り返しても結果は変わらない。再試行するのは利用者側の制限である 429 だけ
const RETRYABLE_STATUSES = new Set([429])
export const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 2000
const MAX_DELAY_MS = 30000
const MAX_HEADER_VALUE_LENGTH = 200
export const BODY_EXCERPT_LENGTH = 200

export const isRetryableStatus = (status) => RETRYABLE_STATUSES.has(status)

const isTimeout = (error) =>
  error instanceof Error && error.name === 'TimeoutError'

/** attempt 回目（1 始まり）の失敗後に待つ時間。数値の Retry-After があれば上限付きで従う */
export function retryDelayMs(attempt, retryAfter) {
  const seconds = Number(retryAfter)
  if (retryAfter && Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_DELAY_MS)
  }
  return Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS)
}

/**
 * 応答を受け取れなかった通信エラー（DNS・接続リセットなど）と 429 だけを再試行して取得する。
 * タイムアウトは Worker やオリジンが応答しないときにも起きるので、5xx と同じく再試行しない。
 * 再試行のたびに、捨てた失敗の診断を onRetry に渡す。再試行し尽くしたときは最後の応答を返し、判定は呼び出し側に任せる
 */
export async function fetchWithRetry(url, init, options = {}) {
  const {
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    maxAttempts = MAX_ATTEMPTS,
    timeoutMs = 30000,
    onRetry = () => {},
  } = options
  for (let attempt = 1; ; attempt++) {
    let response
    try {
      response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (isTimeout(error)) {
        throw new Error(`${url}: no response within ${timeoutMs} ms`, {
          cause: error,
        })
      }
      if (attempt >= maxAttempts) {
        throw new Error(
          `${url}: request failed after ${attempt} attempts: ${errorMessage(error)}`,
          { cause: error },
        )
      }
      const delay = retryDelayMs(attempt)
      onRetry({ attempt, delay, diagnostic: errorMessage(error) })
      await sleep(delay)
      continue
    }
    if (!isRetryableStatus(response.status) || attempt >= maxAttempts) {
      return response
    }
    // 捨てる応答も、どこで止められたかを後から追えるよう診断を残す。HEAD（管理 API）の本文は読まない
    let body
    if (init?.method === 'HEAD') await response.body?.cancel()
    else body = await response.text()
    const delay = retryDelayMs(attempt, response.headers.get('retry-after'))
    onRetry({
      attempt,
      delay,
      diagnostic: describeResponse('Discarded response', response, body),
    })
    await sleep(delay)
  }
}

function errorMessage(error) {
  if (!(error instanceof Error)) return String(error)
  // undici の "fetch failed" は原因（ECONNRESET など）が cause に入る
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : ''
  return `${error.name}: ${error.message}${cause}`
}

/** ログ 1 行に収める。改行を潰すので、本文が GitHub Actions のワークフローコマンド（行頭の ::）にならない */
export function collapseWhitespace(text, limit) {
  return text.replace(/\s+/g, ' ').trim().slice(0, limit)
}

/** GitHub Actions の warning 注釈。% と改行をエスケープし、複数行の診断も 1 行のワークフローコマンドにする */
export function githubWarning(message) {
  const escaped = message
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
  return `::warning::${escaped}`
}

function safeHeaderValue(name, value) {
  // リダイレクト先のクエリには一度限りのトークンが入ることがあるので落とす
  let shown = value
  if (name === 'location') {
    const queryStart = value.search(/[?#]/)
    if (queryStart !== -1) shown = `${value.slice(0, queryStart)}?…`
  }
  return collapseWhitespace(shown, MAX_HEADER_VALUE_LENGTH)
}

/** 許可したヘッダーだけを [名前, 値] で返す。無いものは省く */
export function pickDiagnosticHeaders(headers) {
  return DIAGNOSTIC_HEADERS.flatMap((name) => {
    const value = headers.get(name)
    return value === null ? [] : [[name, safeHeaderValue(name, value)]]
  })
}

/** 想定外の応答の診断。body を渡さないとき（HEAD・管理 API）は本文を出さない */
export function describeResponse(label, response, body) {
  const lines = [`${label}: HTTP ${response.status}`]
  for (const [name, value] of pickDiagnosticHeaders(response.headers)) {
    lines.push(`  ${name}: ${value}`)
  }
  const mitigation = mitigationHint(response.headers)
  if (mitigation) lines.push(`  hint: ${mitigation}`)
  if (body !== undefined) {
    lines.push(`  body: ${collapseWhitespace(body, BODY_EXCERPT_LENGTH)}`)
  }
  return lines.join('\n')
}

function mitigationHint(headers) {
  const cloudflare = headers.get('cf-mitigated')
  if (cloudflare) {
    return `Cloudflare mitigated the request at the edge (cf-mitigated=${collapseWhitespace(cloudflare, 40)}), before the router Worker. GitHub runners are known to be challenged by Bot Fight Mode: see docs/ranking-pipeline-reliability.md`
  }
  const vercel = headers.get('x-vercel-mitigated')
  if (vercel) {
    return `Vercel mitigated the request (x-vercel-mitigated=${collapseWhitespace(vercel, 40)})`
  }
  return null
}

/** SSR の HTML に含まれる動画リンクの種類数 */
export function countVideoLinks(html) {
  const ids = new Set()
  for (const match of html.matchAll(/nicovideo\.jp\/watch\/([a-z]{0,2}\d+)/g)) {
    ids.add(match[1])
  }
  return ids.size
}

/** ランキングとして空なら理由を返す。200 の空画面も障害として扱う */
export function emptyRankingReason(html) {
  if (html.includes('ランキングデータがありません')) {
    return 'shows the empty-ranking message'
  }
  if (countVideoLinks(html) === 0) return 'contains no video links'
  return null
}

/** 管理 API の拒否が要件（401・認証要求・キャッシュ禁止）を満たさなければ理由を返す */
export function adminDenialProblem(response) {
  if (response.status !== 401) return 'expected HTTP 401'
  if (!response.headers.get('www-authenticate')) {
    return 'missing WWW-Authenticate challenge'
  }
  if (!response.headers.get('cache-control')?.includes('no-store')) {
    return 'Cache-Control does not include no-store'
  }
  return null
}

/**
 * 公開 SSR に動画が並ぶこと、管理 API が認証を求めて拒否することを確かめる。想定外なら診断付きで投げる。
 * 再試行で合格した場合も、捨てた失敗を ::warning:: 注釈として log に残す
 */
export async function checkPublicGateway(options = {}) {
  const { fetchImpl = fetch, sleep, log = console.log } = options
  const headers = { 'User-Agent': USER_AGENT }
  const retryOptions = (label, timeoutMs) => ({
    fetchImpl,
    sleep,
    timeoutMs,
    onRetry: ({ attempt, delay, diagnostic }) =>
      log(
        githubWarning(
          `${label}: attempt ${attempt} failed; retrying in ${delay} ms\n${diagnostic}`,
        ),
      ),
  })

  for (const path of SSR_PATHS) {
    const label = `Ranking SSR ${path}`
    const response = await fetchWithRetry(
      new URL(path, SITE_ORIGIN),
      { headers },
      retryOptions(label, 30000),
    )
    const html = await response.text()
    if (response.status !== 200) {
      throw new Error(describeResponse(label, response, html))
    }
    const reason = emptyRankingReason(html)
    if (reason) {
      throw new Error(
        describeResponse(
          `${label} returned an empty ranking (${reason})`,
          response,
          html,
        ),
      )
    }
    log(`Verified ${label}: ${countVideoLinks(html)} video links`)
  }

  const label = `Gateway check ${ADMIN_PATH}`
  const response = await fetchWithRetry(
    new URL(ADMIN_PATH, SITE_ORIGIN),
    { method: 'HEAD', redirect: 'manual', headers },
    retryOptions(label, 15000),
  )
  await response.body?.cancel()
  const problem = adminDenialProblem(response)
  if (problem) {
    throw new Error(describeResponse(`${label}: ${problem}`, response))
  }
  log(
    `Verified ${ADMIN_PATH}: ${response.status} with authentication challenge and no-store`,
  )
}
