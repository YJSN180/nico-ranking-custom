import * as Sentry from '@sentry/cloudflare'

const DYNAMIC_PATH_PATTERNS = [
  [/\/api\/thumbnail\/[^/]+/g, '/api/thumbnail/:videoId'],
  [/\/api\/hd-thumbnail\/[^/]+/g, '/api/hd-thumbnail/:videoId'],
  [/\/trigger\/[^/]+/g, '/trigger/:id'],
]

function sanitizeUrlForSentry(input) {
  if (!input) return undefined

  try {
    const url = input.startsWith('http://') || input.startsWith('https://')
      ? new URL(input)
      : new URL(input, 'https://nico-rank.com')

    const normalizedPath = DYNAMIC_PATH_PATTERNS.reduce(
      (pathname, [pattern, replacement]) => pathname.replace(pattern, replacement),
      url.pathname,
    )

    return normalizedPath
  } catch {
    return DYNAMIC_PATH_PATTERNS.reduce(
      (pathname, [pattern, replacement]) => pathname.replace(pattern, replacement),
      input.split('?')[0].split('#')[0],
    )
  }
}

function normalizeTransactionName(name) {
  if (!name) return name

  const methodMatch = name.match(/^([A-Z]+)\s+(.+)$/)
  if (methodMatch) {
    const [, method, url] = methodMatch
    return `${method} ${sanitizeUrlForSentry(url) || url}`
  }

  return sanitizeUrlForSentry(name) || name
}

function scrubBreadcrumb(breadcrumb) {
  if (!breadcrumb) return breadcrumb

  const nextBreadcrumb = { ...breadcrumb }

  if (nextBreadcrumb.data && typeof nextBreadcrumb.data === 'object') {
    const nextData = { ...nextBreadcrumb.data }

    if (typeof nextData.url === 'string') {
      nextData.url = sanitizeUrlForSentry(nextData.url)
    }

    delete nextData.headers
    delete nextData.request_body
    delete nextData.response_body

    nextBreadcrumb.data = nextData
  }

  return nextBreadcrumb
}

function scrubEvent(event) {
  const nextEvent = { ...event }

  if (nextEvent.request) {
    const nextRequest = { ...nextEvent.request }
    delete nextRequest.cookies
    delete nextRequest.data
    delete nextRequest.headers
    delete nextRequest.query_string

    if (typeof nextRequest.url === 'string') {
      nextRequest.url = sanitizeUrlForSentry(nextRequest.url)
    }

    nextEvent.request = nextRequest
  }

  if (nextEvent.transaction) {
    nextEvent.transaction = normalizeTransactionName(nextEvent.transaction)
  }

  if (Array.isArray(nextEvent.breadcrumbs)) {
    nextEvent.breadcrumbs = nextEvent.breadcrumbs.map(scrubBreadcrumb)
  }

  if (nextEvent.user) {
    delete nextEvent.user
  }

  if (nextEvent.contexts?.response) {
    delete nextEvent.contexts.response
  }

  return nextEvent
}

function buildSafeTags(tags = {}) {
  return Object.fromEntries(
    Object.entries(tags)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)]),
  )
}

function getWorkerEnvironment(env) {
  return env.ENVIRONMENT || 'production'
}

function isProductionWorkerEnvironment(environment) {
  return environment === 'production' || environment === 'green'
}

function workerTracesSampler(environment, samplingContext) {
  if (!isProductionWorkerEnvironment(environment)) {
    return 1
  }

  const transactionName = normalizeTransactionName(samplingContext.name || '')

  if (
    transactionName?.includes('/api/ranking') ||
    transactionName?.includes('/api/tags/autocomplete') ||
    transactionName?.includes('/api/metadata') ||
    transactionName?.includes('scheduled')
  ) {
    return 0.1
  }

  return 0
}

export function createWorkerSentryOptions(env, overrides = {}) {
  const environment = getWorkerEnvironment(env)
  const dsn = env.SENTRY_WORKER_DSN

  return {
    dsn,
    enabled: Boolean(dsn),
    environment,
    release: env.CF_VERSION_METADATA?.id,
    sendDefaultPii: false,
    tracesSampler: (samplingContext) => workerTracesSampler(environment, samplingContext),
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    ...overrides,
  }
}

export function captureWorkerException(error, options = {}) {
  const normalizedError = error instanceof Error ? error : new Error(String(error))

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(buildSafeTags(options.tags || {}))) {
      scope.setTag(key, value)
    }

    for (const [key, value] of Object.entries(options.contexts || {})) {
      scope.setContext(key, value)
    }

    Sentry.captureException(normalizedError)
  })
}

export { Sentry, normalizeTransactionName, sanitizeUrlForSentry }
