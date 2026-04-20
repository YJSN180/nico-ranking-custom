'use client'

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
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,
  integrations: [
    Sentry.browserTracingIntegration({
      beforeStartSpan: (options) => ({
        ...options,
        name: normalizeTransactionName(options.name) || options.name,
      }),
    }),
  ],
  tracePropagationTargets: [
    /^\/api\//,
    /^https:\/\/nico-rank\.com\/api\//,
    /^https?:\/\/localhost:3000\/api\//,
  ],
  tracesSampler: () => (isProductionSentryEnvironment(environment) ? 0.05 : 1),
  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
