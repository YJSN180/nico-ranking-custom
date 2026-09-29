import * as Sentry from '@sentry/nextjs'
import {
  getSentryEnvironment,
  isProductionSentryEnvironment,
  isSentryEnabled,
  normalizeTransactionName,
  scrubDynamicSamplingContext,
  scrubEvent,
  scrubServerBreadcrumb,
  scrubSpan,
} from '@/lib/sentry/shared'

const environment = getSentryEnvironment()
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: isSentryEnabled(dsn, environment),
  environment,
  sendDefaultPii: false,
  // trace のヘッダー（sentry-trace・baggage）は自サイトの API にだけ付ける。本家や Cloudflare の API には送らない
  tracePropagationTargets: [/^https:\/\/nico-rank\.com\/api\//],
  tracesSampler: (samplingContext) => {
    if (!isProductionSentryEnvironment(environment)) {
      return 1
    }

    const transactionName = normalizeTransactionName(
      samplingContext.name || samplingContext.attributes?.['sentry.source']?.toString(),
    )

    return transactionName?.includes('/api/') ? 0.1 : 0
  },
  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
  beforeSendSpan: scrubSpan,
  beforeBreadcrumb: (breadcrumb) => scrubServerBreadcrumb(breadcrumb),
})

Sentry.getClient()?.on('createDsc', scrubDynamicSamplingContext)
