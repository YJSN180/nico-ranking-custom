import { stderr } from 'node:process'

interface RankingFailureDetails {
  stage: 'request' | 'decode' | 'filter'
  upstream: 'public' | 'configured' | 'deployment'
  status?: number
  receivedItems?: number
  filteredItems?: number
  elapsedMs: number
}

// Console calls are removed from production builds. Keep this server-only,
// preview-only diagnostic independent of that transform and never emit payloads.
export function reportPreviewRankingFailure(
  error: unknown,
  details: RankingFailureDetails,
): void {
  if (
    process.env.VERCEL_ENV !== 'preview' &&
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT !== 'preview'
  )
    return
  const name = error instanceof Error ? error.name : 'EmptyResult'
  const cause = error instanceof Error ? error.cause : undefined
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? cause.code
      : undefined
  const networkCodes = [
    'ENOTFOUND',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
  ]
  stderr.write(
    `[SSR ranking failure] ${JSON.stringify({
      stage: details.stage,
      upstream: details.upstream,
      status: details.status,
      receivedItems: details.receivedItems,
      filteredItems: details.filteredItems,
      elapsedMs: details.elapsedMs,
      runtimePreview: process.env.VERCEL_ENV === 'preview',
      errorType: [
        'Error',
        'TypeError',
        'SyntaxError',
        'AbortError',
        'TimeoutError',
        'EmptyResult',
      ].includes(name)
        ? name
        : 'Error',
      networkCode:
        typeof code === 'string' && networkCodes.includes(code)
          ? code
          : undefined,
    })}\n`,
  )
}
