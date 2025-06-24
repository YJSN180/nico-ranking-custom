'use client'

import dynamic from 'next/dynamic'

// Dynamic import to prevent SSR execution
const WebVitalsReporter = dynamic(
  () => import('@/components/web-vitals-reporter').then(mod => ({ default: mod.WebVitalsReporter })),
  { ssr: false }
)

export function ClientOnlyWebVitals() {
  return <WebVitalsReporter />
}