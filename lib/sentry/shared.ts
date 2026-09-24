import type { Breadcrumb, Event } from '@sentry/nextjs'

type SpanJSON = NonNullable<Event['spans']>[number]
type SpanData = SpanJSON['data']
type RequestData = NonNullable<Event['request']>
type Contexts = NonNullable<Event['contexts']>
type EventException = NonNullable<NonNullable<Event['exception']>['values']>[number]
type StackFrame = NonNullable<NonNullable<EventException['stacktrace']>['frames']>[number]
type PrimitiveTag = string | number | boolean | null | undefined

const REDACTED = '[redacted]'

// クエリは許可リストのキーだけ値を残す。検索語が入る q / keyword / tagAnd などを含め、それ以外の値はすべて伏せる
const ALLOWED_QUERY_KEYS = new Set([
  'genre',
  'period',
  'page',
  'limit',
  'offset',
  'sort',
  'order',
  'targets',
  'contentType',
  '_sort',
  '_offset',
  '_limit',
])

// 検索語や ID がパスに入る URL をテンプレートにする
const PATH_TEMPLATES: Array<[RegExp, string]> = [
  [/^\/(search|tag|search_shorts|tag_shorts)\/[^/]+/, '/$1/:query'],
  [/^\/api\/watch\/v3_guest\/[^/]+/, '/api/watch/v3_guest/:videoId'],
  [/^\/v1\/users\/[^/]+/, '/v1/users/:userId'],
  // bulk は一括処理のルートなのでそのまま残す
  [/^\/api\/admin\/ng-list\/derived\/(?!bulk(?:\/|$))[^/]+/, '/api/admin/ng-list/derived/:videoId'],
  [/\/api\/thumbnail\/[^/]+/g, '/api/thumbnail/:videoId'],
  [/\/api\/hd-thumbnail\/[^/]+/g, '/api/hd-thumbnail/:videoId'],
  [/\/mylists\/[^/]+/g, '/mylists/:id'],
]

// パーセントエンコード・空白・非 ASCII を含むパスのセグメントやクエリのキー名は、利用者の入力とみなして伏せる
const USER_TEXT = /%|[^\x21-\x7e]/
const URL_SCHEME = /^([a-z][a-z\d+.-]*):/i
const HTTP_URL = /^https?:\/\//i
const HTTP_ORIGIN = /^https?:\/\/[^/?#]*/i
const PLACEHOLDER_BASE = 'https://placeholder.invalid'

// 「GET /path」「RSC GET /path」「GET https://…」や URL 単体。「middleware GET」のように URL を含まない文字列は対象外
const URL_TEXT = /^((?:[A-Za-z]+\s+)*)((?:\/|https?:\/\/)[\s\S]*)$/i
// 文中の URL（例外メッセージなど）。絶対 URL と、区切り文字の直後から始まるパス
const EMBEDDED_URL = /(https?:\/\/[^\s"'<>`]+)|(^|[\s("'=,:;[{])(\/(?!\/)[^\s"'<>`]*)/gi
const SCRIPT_FILE = /\.(?:[cm]?js|jsx|tsx?)$/i
const SENSITIVE_MESSAGE = /authorization|cookie|password|token/i

const DROPPED_SPAN_ATTRIBUTES = new Set([
  'url.query',
  'http.query',
  'url.fragment',
  'http.fragment',
  'http.request.body.data',
])
// ヘッダー（referer・next-url・next-router-state-tree など）にはページの URL や検索語が入るので送らない
const DROPPED_SPAN_ATTRIBUTE_PREFIXES = ['http.request.header.', 'http.response.header.']
const URL_SPAN_ATTRIBUTES = new Set(['url', 'url.full', 'http.url', 'http.target', 'url.path'])
// ルート名やスパン名。INP などの単独スパンは transaction 属性にページのパスを持つ
const URL_TEXT_SPAN_ATTRIBUTES = new Set(['next.span_name', 'http.route', 'transaction'])
const BREADCRUMB_URL_KEYS = ['url', 'to', 'from']

const SENDING_ENVIRONMENTS = new Set(['production', 'preview'])

function scrubSearchParams(searchParams: URLSearchParams): string {
  const nextParams = new URLSearchParams()

  searchParams.forEach((value, key) => {
    if (ALLOWED_QUERY_KEYS.has(key)) {
      nextParams.append(key, value)
      return
    }

    nextParams.append(USER_TEXT.test(key) ? REDACTED : key, REDACTED)
  })

  return nextParams.toString()
}

function templatePath(pathname: string): string {
  const templatedPath = PATH_TEMPLATES.reduce(
    (currentPath, [pattern, replacement]) => currentPath.replace(pattern, replacement),
    pathname,
  )

  return templatedPath
    .split('/')
    .map((segment) => (USER_TEXT.test(segment) ? ':redacted' : segment))
    .join('/')
}

/**
 * クエリを許可リストで伏せ、パスをテンプレートにし、フラグメントと認証情報を落とす。
 * 絶対 URL はオリジンを残し、相対 URL は相対のまま返す。
 */
export function scrubUrl(input: string): string {
  if (!input) return input

  const scheme = URL_SCHEME.exec(input)?.[1].toLowerCase()
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    return `${scheme}:${REDACTED}`
  }

  let url: URL
  try {
    url = new URL(input, PLACEHOLDER_BASE)
  } catch {
    return REDACTED
  }

  const origin = scheme ? `${url.protocol}//${url.host}` : ''
  const query = scrubSearchParams(url.searchParams)

  return `${origin}${templatePath(url.pathname)}${query ? `?${query}` : ''}`
}

/** scrubUrl の結果からオリジンを外したもの（トランザクション名を同じルートでまとめるため） */
export function sanitizeUrlForSentry(input?: string | null): string | undefined {
  if (!input) return undefined

  return scrubUrl(input).replace(HTTP_ORIGIN, '')
}

function rewriteUrlText(text: string, rewriteUrl: (url: string) => string): string {
  const match = URL_TEXT.exec(text)

  return match ? `${match[1]}${rewriteUrl(match[2])}` : text
}

function scrubUrlsInText(text: string): string {
  return text.replace(
    EMBEDDED_URL,
    (_match: string, absoluteUrl: string | undefined, boundary: string | undefined, path: string | undefined) =>
      absoluteUrl ? scrubUrl(absoluteUrl) : `${boundary ?? ''}${scrubUrl(path ?? '')}`,
  )
}

export function normalizeTransactionName(name?: string | null): string | undefined {
  if (!name) return name ?? undefined

  return rewriteUrlText(name, (url) => sanitizeUrlForSentry(url) ?? url)
}

function scrubSpanData(data: SpanData | undefined): SpanData {
  const nextData: SpanData = {}
  if (!data) return nextData

  for (const [key, value] of Object.entries(data)) {
    if (DROPPED_SPAN_ATTRIBUTES.has(key) || DROPPED_SPAN_ATTRIBUTE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      continue
    }

    if (typeof value === 'string' && URL_SPAN_ATTRIBUTES.has(key)) {
      nextData[key] = scrubUrl(value)
    } else if (typeof value === 'string' && URL_TEXT_SPAN_ATTRIBUTES.has(key)) {
      nextData[key] = rewriteUrlText(value, scrubUrl)
    } else {
      nextData[key] = value
    }
  }

  return nextData
}

/** beforeSendSpan 用。トランザクションのルートと子のスパンの両方に適用される */
export function scrubSpan(span: SpanJSON): SpanJSON {
  const nextSpan: SpanJSON = { ...span, data: scrubSpanData(span.data) }

  if (typeof nextSpan.description === 'string') {
    nextSpan.description = rewriteUrlText(nextSpan.description, scrubUrl)
  }

  return nextSpan
}

function scrubRequest(request: RequestData): RequestData {
  // ヘッダー・Cookie・本文・クエリ文字列は送らず、メソッドと整えた URL だけを残す
  const nextRequest: RequestData = {}

  if (typeof request.method === 'string') {
    nextRequest.method = request.method
  }

  if (typeof request.url === 'string') {
    nextRequest.url = scrubUrl(request.url)
  }

  return nextRequest
}

function scrubContexts(contexts: Contexts): Contexts {
  const nextContexts: Contexts = { ...contexts }
  delete nextContexts.response

  const trace = nextContexts.trace
  if (trace?.data && typeof trace.data === 'object') {
    const data = scrubSpanData(trace.data)
    delete data['http.request.body.size']
    delete data['http.response.body.size']
    nextContexts.trace = { ...trace, data }
  }

  // Next.js の onRequestError が入れるリクエストパス（クエリ付き）
  const nextjs = nextContexts.nextjs
  if (nextjs && typeof nextjs.request_path === 'string') {
    nextContexts.nextjs = { ...nextjs, request_path: scrubUrl(nextjs.request_path) }
  }

  return nextContexts
}

function scrubFrameLocation(location: string): string {
  // インラインスクリプトのフレームにはページの URL が入る。スクリプトファイルはソースマップ解決のため触らない
  if (!HTTP_URL.test(location)) return location

  const [path] = location.split(/[?#]/)
  return SCRIPT_FILE.test(path) ? location : scrubUrl(location)
}

function scrubFrame(frame: StackFrame): StackFrame {
  const nextFrame: StackFrame = { ...frame }

  if (typeof nextFrame.filename === 'string') {
    nextFrame.filename = scrubFrameLocation(nextFrame.filename)
  }

  if (typeof nextFrame.abs_path === 'string') {
    nextFrame.abs_path = scrubFrameLocation(nextFrame.abs_path)
  }

  return nextFrame
}

function scrubException(exception: EventException): EventException {
  const nextException: EventException = { ...exception }

  if (typeof nextException.value === 'string') {
    nextException.value = scrubUrlsInText(nextException.value)
  }

  const frames = nextException.stacktrace?.frames
  if (frames) {
    nextException.stacktrace = { ...nextException.stacktrace, frames: frames.map(scrubFrame) }
  }

  return nextException
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb | null): Breadcrumb | null {
  if (!breadcrumb) return breadcrumb

  const nextBreadcrumb: Breadcrumb = { ...breadcrumb }

  if (typeof nextBreadcrumb.message === 'string') {
    nextBreadcrumb.message = SENSITIVE_MESSAGE.test(nextBreadcrumb.message)
      ? REDACTED
      : scrubUrlsInText(nextBreadcrumb.message)
  }

  if (nextBreadcrumb.data && typeof nextBreadcrumb.data === 'object') {
    const nextData: Record<string, unknown> = { ...nextBreadcrumb.data }

    for (const key of BREADCRUMB_URL_KEYS) {
      const value = nextData[key]
      if (typeof value === 'string') {
        nextData[key] = scrubUrl(value)
      }
    }

    if (Array.isArray(nextData.arguments)) {
      nextData.arguments = nextData.arguments.map((argument: unknown) =>
        typeof argument === 'string' ? scrubUrlsInText(argument) : argument,
      )
    }

    delete nextData.headers
    delete nextData.input
    delete nextData.response
    delete nextData['http.query']
    delete nextData['http.fragment']

    nextBreadcrumb.data = nextData
  }

  return nextBreadcrumb
}

/** サーバー（Node.js / Edge）用。console の出力はリクエストの中身を含みうるので breadcrumb にしない */
export function scrubServerBreadcrumb(breadcrumb: Breadcrumb | null): Breadcrumb | null {
  if (!breadcrumb || breadcrumb.category === 'console') return null

  return scrubBreadcrumb(breadcrumb)
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

export function scrubEvent<T extends Event>(event: T): T {
  const nextEvent: T = { ...event }

  if (nextEvent.request) {
    nextEvent.request = scrubRequest(nextEvent.request)
  }

  if (nextEvent.contexts) {
    nextEvent.contexts = scrubContexts(nextEvent.contexts)
  }

  if (Array.isArray(nextEvent.breadcrumbs)) {
    nextEvent.breadcrumbs = nextEvent.breadcrumbs.map(scrubBreadcrumb).filter(isPresent)
  }

  if (Array.isArray(nextEvent.spans)) {
    nextEvent.spans = nextEvent.spans.map(scrubSpan)
  }

  if (nextEvent.exception?.values) {
    nextEvent.exception = { ...nextEvent.exception, values: nextEvent.exception.values.map(scrubException) }
  }

  if (typeof nextEvent.message === 'string') {
    nextEvent.message = scrubUrlsInText(nextEvent.message)
  }

  if (typeof nextEvent.logentry?.message === 'string') {
    nextEvent.logentry = { ...nextEvent.logentry, message: scrubUrlsInText(nextEvent.logentry.message) }
  }

  delete nextEvent.user

  if (nextEvent.transaction) {
    nextEvent.transaction = normalizeTransactionName(nextEvent.transaction)
  }

  return nextEvent
}

/**
 * client.on('createDsc') 用。DSC のトランザクション名はエンベロープのヘッダーと baggage に載り、
 * beforeSend 系を通らないためここで整える（SDK の約束どおり、渡された DSC をその場で書き換える）。
 */
export function scrubDynamicSamplingContext(dsc: { transaction?: string }): void {
  if (dsc.transaction) {
    dsc.transaction = normalizeTransactionName(dsc.transaction)
  }
}

/**
 * Sentry の環境名。next.config.mjs がビルド時の VERCEL_ENV を NEXT_PUBLIC_SENTRY_ENVIRONMENT として埋め込むため、
 * クライアントでも production / preview を名乗れる。どちらも無ければ local（ローカルの本番ビルドも local）。
 */
export function getSentryEnvironment(): string {
  return process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || 'local'
}

export function isProductionSentryEnvironment(environment = getSentryEnvironment()): boolean {
  return environment === 'production'
}

/** DSN があり、production か preview のときだけ送る。それ以外は NEXT_PUBLIC_SENTRY_FORCE_ENABLE=true のときだけ */
export function isSentryEnabled(dsn: string | undefined, environment = getSentryEnvironment()): boolean {
  if (!dsn) return false

  return SENDING_ENVIRONMENTS.has(environment) || process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === 'true'
}

export function buildSafeTags(tags: Record<string, PrimitiveTag>) {
  return Object.fromEntries(
    Object.entries(tags)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)]),
  )
}
