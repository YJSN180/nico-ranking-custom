// Dynamic import for web-vitals to reduce initial bundle size
import type { Metric } from 'web-vitals'

const vitalsUrl = 'https://vitals.vercel-analytics.com/v1/vitals'

// Web Vitals の推奨しきい値 (Good の上限)
const THRESHOLDS = {
  LCP: 2500, // 2.5秒以下が良好
  FID: 100, // 100ms以下が良好
  CLS: 0.1, // 0.1以下が良好
  FCP: 1800, // 1.8秒以下が良好
  TTFB: 800, // 800ms以下が良好
  INP: 200, // 200ms以下が良好
} as const

function getRating(
  name: string,
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name as keyof typeof THRESHOLDS]
  if (!threshold) return 'good'

  if (value <= threshold) return 'good'
  if (value <= threshold * 2) return 'needs-improvement'
  return 'poor'
}

function formatValue(name: string, value: number): string {
  if (name === 'CLS') {
    return value.toFixed(3)
  }
  return Math.round(value) + 'ms'
}

function getConnectionSpeed(): string {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string }
    mozConnection?: { effectiveType?: string }
    webkitConnection?: { effectiveType?: string }
  }
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection
  return conn?.effectiveType || 'unknown'
}

function logToConsole(metric: Metric): void {
  const rating = getRating(metric.name, metric.value)
  const formattedValue = formatValue(metric.name, metric.value)

  const colors = {
    good: 'color: #0cce6b',
    'needs-improvement': 'color: #ffa400',
    poor: 'color: #ff4e42',
  }

  // eslint-disable-next-line no-console
  console.debug(
    '%c[Web Vital] ' + metric.name + ': ' + formattedValue + ' (' + rating + ')',
    colors[rating]
  )
}

function sendToAnalytics(
  metric: Metric,
  options: { params: Record<string, string> }
): void {
  if (typeof window === 'undefined') return

  // 開発環境ではコンソールに出力
  if (process.env.NODE_ENV === 'development') {
    logToConsole(metric)
    return
  }

  const page = Object.entries(options.params).reduce(
    (acc, [key, value]) => acc.replace(value, '[' + key + ']'),
    window.location.pathname
  )

  const dsn = process.env.NEXT_PUBLIC_ANALYTICS_ID || ''
  if (!dsn) {
    return
  }

  const body = {
    dsn,
    id: metric.id,
    page,
    href: window.location.href,
    event_name: metric.name,
    value: metric.value.toString(),
    speed: getConnectionSpeed(),
  }

  const params = new URLSearchParams()
  Object.entries(body).forEach(([key, value]) => {
    params.append(key, String(value))
  })

  const blob = new Blob([params.toString()], {
    type: 'application/x-www-form-urlencoded',
  })

  if (navigator.sendBeacon) {
    navigator.sendBeacon(vitalsUrl, blob)
  } else {
    fetch(vitalsUrl, {
      body: blob,
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
    })
  }
}

export async function reportWebVitals(): Promise<void> {
  try {
    // Dynamic import to avoid including web-vitals in the initial bundle
    const { onCLS, onFCP, onLCP, onTTFB, onINP } = await import('web-vitals')

    onTTFB((metric: Metric) => sendToAnalytics(metric, { params: {} }))
    onLCP((metric: Metric) => sendToAnalytics(metric, { params: {} }))
    onCLS((metric: Metric) => sendToAnalytics(metric, { params: {} }))
    onFCP((metric: Metric) => sendToAnalytics(metric, { params: {} }))
    onINP((metric: Metric) => sendToAnalytics(metric, { params: {} }))
  } catch {
    // Fail silently
  }
}
