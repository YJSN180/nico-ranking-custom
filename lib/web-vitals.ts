type Metric = {
  id: string
  name: string
  value: number
}

const vitalsUrl = 'https://vitals.vercel-analytics.com/v1/vitals'

function getConnectionSpeed() {
  if (typeof navigator === 'undefined') return 'unknown'
  const nav = navigator as any
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection
  return conn ? conn.effectiveType : 'unknown'
}

function sendToAnalytics(metric: Metric, options: { params: { [key: string]: any } }) {
  if (typeof window === 'undefined') return
  
  const page = Object.entries(options.params).reduce(
    (acc, [key, value]) => acc.replace(value, `[${key}]`),
    window.location.pathname
  )

  const dsn = process.env.NEXT_PUBLIC_ANALYTICS_ID || ''
  if (!dsn || process.env.NODE_ENV !== 'production') {
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

export async function reportWebVitals() {
  if (typeof window === 'undefined') return
  
  try {
    const { onCLS, onFCP, onLCP, onTTFB, onINP } = await import('web-vitals')
    
    onTTFB((metric) => sendToAnalytics(metric, { params: {} }))
    onLCP((metric) => sendToAnalytics(metric, { params: {} }))
    onCLS((metric) => sendToAnalytics(metric, { params: {} }))
    onFCP((metric) => sendToAnalytics(metric, { params: {} }))
    onINP((metric) => sendToAnalytics(metric, { params: {} }))
  } catch (err) {
    // Fail silently
  }
}