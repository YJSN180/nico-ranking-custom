const SENSITIVE_QUERY_KEYS = new Set([
  'authorization',
  'cookie',
  'key',
  'memo',
  'password',
  'q',
  'query',
  'tag',
  'title',
  'token',
  'username',
])

const DYNAMIC_PATH_PATTERNS: Array<[RegExp, string]> = [
  [/\/api\/thumbnail\/[^/]+/g, '/api/thumbnail/:videoId'],
  [/\/api\/hd-thumbnail\/[^/]+/g, '/api/hd-thumbnail/:videoId'],
  [/\/mylists\/[^/]+/g, '/mylists/:id'],
]

type PrimitiveTag = string | number | boolean | null | undefined

function scrubSearchParams(searchParams: URLSearchParams) {
  const nextParams = new URLSearchParams()

  for (const [key, value] of searchParams.entries()) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      nextParams.set(key, '[redacted]')
      continue
    }

    nextParams.set(key, value)
  }

  return nextParams
}

function normalizeDynamicPath(pathname: string) {
  return DYNAMIC_PATH_PATTERNS.reduce(
    (currentPath, [pattern, replacement]) => currentPath.replace(pattern, replacement),
    pathname,
  )
}

export function getSentryEnvironment() {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
}

export function isProductionSentryEnvironment(environment = getSentryEnvironment()) {
  return environment === 'production'
}

export function sanitizeUrlForSentry(input?: string | null) {
  if (!input) return undefined

  try {
    const url = input.startsWith('http://') || input.startsWith('https://')
      ? new URL(input)
      : new URL(input, 'https://nico-rank.com')

    const normalizedPath = normalizeDynamicPath(url.pathname)
    const nextParams = scrubSearchParams(url.searchParams)
    const nextSearch = nextParams.toString()

    return nextSearch ? `${normalizedPath}?${nextSearch}` : normalizedPath
  } catch {
    const [withoutHash] = input.split('#')
    const [pathname, rawSearch = ''] = withoutHash.split('?')
    const nextParams = scrubSearchParams(new URLSearchParams(rawSearch))
    const normalizedPath = normalizeDynamicPath(pathname || input)
    const nextSearch = nextParams.toString()

    return nextSearch ? `${normalizedPath}?${nextSearch}` : normalizedPath
  }
}

export function normalizeTransactionName(name?: string | null) {
  if (!name) return name ?? undefined

  const methodMatch = name.match(/^([A-Z]+)\s+(.+)$/)
  if (methodMatch) {
    const [, method, url] = methodMatch
    const sanitizedUrl = sanitizeUrlForSentry(url) || normalizeDynamicPath(url)
    return `${method} ${sanitizedUrl}`
  }

  return sanitizeUrlForSentry(name) || normalizeDynamicPath(name)
}

function scrubRequest(request: Record<string, unknown> | undefined) {
  if (!request) return request

  const nextRequest = { ...request }
  delete nextRequest.cookies
  delete nextRequest.data
  delete nextRequest.fragment
  delete nextRequest.headers
  delete nextRequest.query_string

  if (typeof nextRequest.url === 'string') {
    nextRequest.url = sanitizeUrlForSentry(nextRequest.url)
  }

  return nextRequest
}

function scrubContexts(contexts: Record<string, any> | undefined) {
  if (!contexts) return contexts

  const nextContexts = { ...contexts }

  if (nextContexts.response) {
    delete nextContexts.response
  }

  if (nextContexts.trace?.data && typeof nextContexts.trace.data === 'object') {
    const traceData = { ...nextContexts.trace.data }

    if (typeof traceData.url === 'string') {
      traceData.url = sanitizeUrlForSentry(traceData.url)
    }

    delete traceData['http.request.body.size']
    delete traceData['http.response.body.size']

    nextContexts.trace = {
      ...nextContexts.trace,
      data: traceData,
    }
  }

  return nextContexts
}

export function scrubBreadcrumb<T extends Record<string, any> | null>(breadcrumb: T): T {
  if (!breadcrumb) return breadcrumb

  const nextBreadcrumb: Record<string, any> = { ...breadcrumb }

  if (typeof nextBreadcrumb.message === 'string' && /authorization|cookie|password|token/i.test(nextBreadcrumb.message)) {
    nextBreadcrumb.message = '[redacted]'
  }

  if (nextBreadcrumb.data && typeof nextBreadcrumb.data === 'object') {
    const nextData = { ...nextBreadcrumb.data }

    if (typeof nextData.url === 'string') {
      nextData.url = sanitizeUrlForSentry(nextData.url)
    }

    if (typeof nextData.to === 'string') {
      nextData.to = sanitizeUrlForSentry(nextData.to)
    }

    if (typeof nextData.from === 'string') {
      nextData.from = sanitizeUrlForSentry(nextData.from)
    }

    delete nextData.headers
    delete nextData.input
    delete nextData.response

    nextBreadcrumb.data = nextData
  }

  return nextBreadcrumb as T
}

export function scrubEvent<T extends Record<string, any>>(event: T): T {
  const nextEvent: Record<string, any> = { ...event }

  nextEvent.request = scrubRequest(nextEvent.request)
  nextEvent.contexts = scrubContexts(nextEvent.contexts)

  if (Array.isArray(nextEvent.breadcrumbs)) {
    nextEvent.breadcrumbs = nextEvent.breadcrumbs
      .map((breadcrumb: Record<string, any>) => scrubBreadcrumb(breadcrumb))
      .filter(Boolean)
  }

  if (nextEvent.user) {
    delete nextEvent.user
  }

  if (nextEvent.transaction) {
    nextEvent.transaction = normalizeTransactionName(nextEvent.transaction)
  }

  return nextEvent as T
}

export function buildSafeTags(tags: Record<string, PrimitiveTag>) {
  return Object.fromEntries(
    Object.entries(tags)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)]),
  )
}
