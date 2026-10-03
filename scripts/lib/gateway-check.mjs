// デプロイ後のスモークチェック（scripts/check-admin-gateway.mjs から実行）の本体と、判定・再試行・診断出力。
// GitHub runner で npm ci なしに動かすため、依存パッケージを使わない。
import { appendFileSync } from 'node:fs'

export const SITE_ORIGIN = 'https://nico-rank.com'
export const SSR_PATHS = ['/', '/?genre=game&period=24h']
export const ADMIN_PATH = '/api/admin/ng-list'
// 偽装はせず、Cloudflare の Security Events で見分けられる名前を名乗る（static-asset-probe.mjs と同じ）
export const USER_AGENT = 'nico-ranking-verification/1.0'

// 配備した Worker は workers.dev で直接確かめる。workers.dev は nico-rank.com のゾーン外なので、
// GitHub runner からでもゾーンの Bot 対策（Bot Fight Mode）にチャレンジされない。
// wrangler 4 は workers_dev を省いた設定を、routes が無ければ workers.dev 有効、あれば無効で配備する。
// Green と Blue は routes が無いので有効。ルーターは nico-rank.com/* の route を持つので無効（error code: 1042 が返る）
export const WORKERS_DEV_ORIGINS = {
  'nico-ranking-api-gateway-green':
    'https://nico-ranking-api-gateway-green.yjsn180180.workers.dev',
  'nico-ranking-blue-20250706':
    'https://nico-ranking-blue-20250706.yjsn180180.workers.dev',
}
export const ROUTER_WORKER = 'nico-ranking-api-gateway'
export const RANKING_GENRE = 'all'
export const RANKING_PERIOD = '24h'
const VIDEO_ID = /^[a-z]{2}\d+$/

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
  const mitigation = mitigationHint(response)
  if (mitigation) lines.push(`  hint: ${mitigation}`)
  if (body !== undefined) {
    lines.push(`  body: ${collapseWhitespace(body, BODY_EXCERPT_LENGTH)}`)
  }
  return lines.join('\n')
}

/**
 * ゾーンの Cloudflare がルーター Worker より前でチャレンジした応答か。
 * runner が受け取ったチャレンジ（run 37133622281）は 403・cf-mitigated: challenge で、ルーターが付ける x-router-version は無い。
 * ルーターは上流の応答ヘッダーを引き継ぐので、cf-mitigated があるだけではルーターより前の応答とは言えない。
 * 403 以外、challenge 以外の値（block など）、x-router-version 付きは、警告で済ませず従来どおり失敗にする。
 * 管理パスの応答にはルーターも x-router-version を付けないので、そこでは 403 と challenge で見分ける
 */
export const isEdgeChallenge = (response) =>
  response.status === 403 &&
  response.headers.get('cf-mitigated')?.trim().toLowerCase() === 'challenge' &&
  response.headers.get('x-router-version') === null

function mitigationHint(response) {
  const { headers } = response
  const cloudflare = headers.get('cf-mitigated')
  if (cloudflare) {
    const value = collapseWhitespace(cloudflare, 40)
    // ルーター経由で上流から来た cf-mitigated に「ルーターより前」とは書かない
    if (!isEdgeChallenge(response)) {
      return `cf-mitigated=${value} is present, but this is not a Cloudflare edge challenge (HTTP 403 with cf-mitigated=challenge and no x-router-version)`
    }
    return `Cloudflare mitigated the request at the edge (cf-mitigated=${value}), before the router Worker. GitHub runners are known to be challenged by Bot Fight Mode: see docs/ranking-pipeline-reliability.md`
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

/** ランキング API の JSON（{ items, metadata }）として足りなければ理由を返す。鮮度は見ない（鮮度監視が別にある） */
export function rankingPayloadProblem(data, genre, period) {
  if (!Array.isArray(data?.items)) return 'items is not an array'
  if (data.items.length === 0) return 'items is empty'
  const isVideo = (item) =>
    typeof item?.id === 'string' && VIDEO_ID.test(item.id)
  if (!data.items.some(isVideo)) {
    return 'items contain no video ids'
  }
  const { metadata } = data
  if (metadata?.genre !== genre || metadata?.period !== period) {
    return `metadata does not match genre=${genre} period=${period}`
  }
  if (
    typeof metadata.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(metadata.updatedAt))
  ) {
    return 'metadata.updatedAt is not a date'
  }
  return null
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** 1 回のチェックで共有する送信と出力。再試行で捨てた失敗は ::warning:: 注釈として log に残す */
function checkContext({ fetchImpl = fetch, sleep, log = console.log } = {}) {
  const headers = { 'User-Agent': USER_AGENT }
  const request = (url, init, label, timeoutMs) =>
    fetchWithRetry(
      url,
      { ...init, headers },
      {
        fetchImpl,
        sleep,
        timeoutMs,
        onRetry: ({ attempt, delay, diagnostic }) =>
          log(
            githubWarning(
              `${label}: attempt ${attempt} failed; retrying in ${delay} ms\n${diagnostic}`,
            ),
          ),
      },
    )
  // 管理 API には HEAD だけを送り、本文は読まない
  const headAdmin = async (url, label) => {
    const response = await request(
      url,
      { method: 'HEAD', redirect: 'manual' },
      label,
      15000,
    )
    await response.body?.cancel()
    return response
  }
  return { log, request, headAdmin }
}

/**
 * 配備した Worker を workers.dev で直接確かめる。ランキング API が動画の並ぶ JSON を返すことと、管理パスの拒否を見る。
 * Green と Blue は管理パスを Vercel（middleware が Basic 認証を強制する）にだけ中継し、no-store を付ける。
 * 未認証で 401・認証要求・no-store が返れば、配備した Worker が管理パスをその経路にだけ流していると分かる。
 * workers.dev が無い Worker は確かめずに 'skipped' を返す。想定外の応答は診断付きで投げる
 */
export async function checkDeployedWorker(workerName, options = {}) {
  const { log, request, headAdmin } = checkContext(options)
  if (workerName === ROUTER_WORKER) {
    log(
      `Skipped the direct check of ${workerName}: it has the nico-rank.com/* route, so its workers.dev URL is disabled. The public check covers the router`,
    )
    return 'skipped'
  }
  const origin = WORKERS_DEV_ORIGINS[workerName]
  if (!origin) {
    const reason = workerName
      ? `no workers.dev URL is known for "${workerName}"`
      : 'no worker name was given (--worker)'
    log(
      githubWarning(
        `Skipped the direct check of the deployed Worker: ${reason}. Known: ${Object.keys(WORKERS_DEV_ORIGINS).join(', ')}`,
      ),
    )
    return 'skipped'
  }

  const rankingUrl = new URL('/api/ranking', origin)
  rankingUrl.search = new URLSearchParams({
    genre: RANKING_GENRE,
    period: RANKING_PERIOD,
  }).toString()
  const rankingLabel = `${workerName} ${rankingUrl.pathname}${rankingUrl.search}`
  const response = await request(rankingUrl, {}, rankingLabel, 30000)
  const body = await response.text()
  if (response.status !== 200) {
    throw new Error(describeResponse(rankingLabel, response, body))
  }
  const data = parseJson(body)
  const problem =
    data === undefined
      ? 'body is not JSON'
      : rankingPayloadProblem(data, RANKING_GENRE, RANKING_PERIOD)
  if (problem) {
    throw new Error(
      describeResponse(`${rankingLabel}: ${problem}`, response, body),
    )
  }
  // 応答の値をそのままログに出さない（行頭の ::error:: などのワークフローコマンドを作らせない）
  const updatedAt = new Date(Date.parse(data.metadata.updatedAt)).toISOString()
  log(
    `Verified ${rankingLabel} on workers.dev: ${data.items.length} items, updated at ${updatedAt}`,
  )

  const adminLabel = `${workerName} ${ADMIN_PATH}`
  const admin = await headAdmin(new URL(ADMIN_PATH, origin), adminLabel)
  const adminProblem = adminDenialProblem(admin)
  if (adminProblem) {
    throw new Error(describeResponse(`${adminLabel}: ${adminProblem}`, admin))
  }
  log(
    `Verified ${adminLabel} on workers.dev: ${admin.status} with authentication challenge and no-store`,
  )
  return 'verified'
}

const MANUAL_EDGE_CHECK = `Verify ${SITE_ORIGIN} manually from an unauthenticated browser or a residential network: videos on / and on a genre page, and HTTP 401 on ${ADMIN_PATH}`

/**
 * 公開 SSR に動画が並ぶこと、管理 API が認証を求めて拒否することを確かめる。想定外なら診断付きで投げる。
 * ゾーンの Cloudflare がチャレンジした応答（isEdgeChallenge）だけは失敗にせず、確かめられなかったことを
 * ::warning:: 注釈に残して次へ進む。GitHub runner は Bot Fight Mode にチャレンジされ、それを回避はしない
 * （docs/ranking-pipeline-reliability.md）。確かめたものとチャレンジされたもののラベルを返す
 */
export async function checkPublicGateway(options = {}) {
  const { log, request, headAdmin } = checkContext(options)
  const result = { verified: [], challenged: [] }
  const challenged = (label, response, body) => {
    log(
      githubWarning(
        `Public edge not verified: Cloudflare challenged ${label} at the nico-rank.com edge, as it does for GitHub runners. ${MANUAL_EDGE_CHECK}\n${describeResponse(label, response, body)}`,
      ),
    )
    result.challenged.push(label)
  }

  for (const path of SSR_PATHS) {
    const label = `Ranking SSR ${path}`
    const response = await request(new URL(path, SITE_ORIGIN), {}, label, 30000)
    const html = await response.text()
    if (isEdgeChallenge(response)) {
      challenged(label, response, html)
      continue
    }
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
    result.verified.push(label)
  }

  const label = `Gateway check ${ADMIN_PATH}`
  const response = await headAdmin(new URL(ADMIN_PATH, SITE_ORIGIN), label)
  if (isEdgeChallenge(response)) {
    challenged(label, response)
    return result
  }
  const problem = adminDenialProblem(response)
  if (problem) {
    throw new Error(describeResponse(`${label}: ${problem}`, response))
  }
  log(
    `Verified ${ADMIN_PATH}: ${response.status} with authentication challenge and no-store`,
  )
  result.verified.push(label)
  return result
}

/**
 * デプロイ後のゲート。配備した Worker を workers.dev で直接確かめてから、公開ドメインを確かめる。
 * directOnly では公開ドメインを見ない（runner からの定期監視用）。そのとき直接確かめる先が無ければ失敗にする
 */
export async function runSmokeCheck({
  workerName,
  directOnly = false,
  ...options
} = {}) {
  const { log = console.log } = options
  const direct = await checkDeployedWorker(workerName, options)
  if (directOnly) {
    if (direct === 'skipped') {
      throw new Error(
        'Nothing was checked: the direct check was skipped and --direct-only turns off the public check',
      )
    }
    return
  }
  const edge = await checkPublicGateway(options)
  const total = edge.verified.length + edge.challenged.length
  log(
    `Summary: direct check of ${workerName || '(no worker)'} ${direct}; public edge verified ${edge.verified.length} of ${total}, challenged ${edge.challenged.length}`,
  )
  // ルーターだけを配備したときなど、何も確かめられなかった成功を、確かめた成功と見分けられるようにする
  if (direct === 'skipped' && edge.verified.length === 0) {
    log(
      githubWarning(
        'Deployment NOT verified: nothing could be checked from this runner. Verify https://nico-rank.com manually from an unauthenticated browser or a residential network: ranking pages show video cards, /api/ranking returns items, and /api/admin/ng-list returns 401.',
      ),
    )
    const { writeStepSummary = defaultStepSummary } = options
    writeStepSummary(
      [
        '## Deployment NOT verified',
        '',
        `The direct check of ${workerName || '(no worker)'} was skipped and the public edge was challenged for every request.`,
        'Verify https://nico-rank.com manually from an unauthenticated browser or a residential network:',
        '- ranking pages (/ and a genre page) show video cards',
        '- /api/ranking?genre=all&period=24h returns items',
        '- /api/admin/ng-list returns 401',
        '',
      ].join('\n'),
    )
  }
}

/** GitHub Actions のジョブの要約に追記する。Actions の外（手元の実行）では何もしない */
function defaultStepSummary(markdown) {
  const path = process.env.GITHUB_STEP_SUMMARY
  if (path) appendFileSync(path, markdown)
}
