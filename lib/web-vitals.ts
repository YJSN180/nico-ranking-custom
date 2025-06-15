import { onCLS, onFCP, onFID, onLCP, onTTFB, onINP, type Metric } from 'web-vitals'

const vitalsUrl = 'https://vitals.vercel-analytics.com/v1/vitals'

function getConnectionSpeed() {
  const nav = navigator as any
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection
  return conn ? conn.effectiveType : 'unknown'
}

function sendToAnalytics(metric: Metric, options: { params: { [key: string]: any } }) {
  const page = Object.entries(options.params).reduce(
    (acc, [key, value]) => acc.replace(value, `[${key}]`),
    window.location.pathname
  )

  const body = {
    dsn: process.env.NEXT_PUBLIC_ANALYTICS_ID, // Vercel Analytics ID
    id: metric.id,
    page,
    href: window.location.href,
    event_name: metric.name,
    value: metric.value.toString(),
    speed: getConnectionSpeed(),
  }

  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ANALYTICS_ID) {
    const blob = new Blob([new URLSearchParams(body).toString()], {
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
}

export function reportWebVitals() {
  try {
    onFID((metric) => sendToAnalytics(metric, { params: {} }))
    onTTFB((metric) => sendToAnalytics(metric, { params: {} }))
    onLCP((metric) => sendToAnalytics(metric, { params: {} }))
    onCLS((metric) => sendToAnalytics(metric, { params: {} }))
    onFCP((metric) => sendToAnalytics(metric, { params: {} }))
    onINP((metric) => sendToAnalytics(metric, { params: {} }))
  } catch (err) {
    // Fail silently
  }
}