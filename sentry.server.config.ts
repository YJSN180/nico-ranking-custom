import * as Sentry from '@sentry/nextjs'
import {
  getSentryEnvironment,
  isProductionSentryEnvironment,
  normalizeTransactionName,
  scrubBreadcrumb,
  scrubEvent,
} from '@/lib/sentry/shared'

const environment = getSentryEnvironment()
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment,
  sendDefaultPii: false,
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
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
})
