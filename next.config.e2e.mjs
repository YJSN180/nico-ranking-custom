import baseConfig from './next.config.mjs'

// E2Eテスト専用の設定
const e2eConfig = {
  ...baseConfig,
  async headers() {
    const baseHeaders = await baseConfig.headers()
    
    // E2E環境ではCSPを緩和
    return baseHeaders.map(route => {
      if (route.source === '/:path*') {
        return {
          ...route,
          headers: route.headers.map(header => {
            if (header.key === 'Content-Security-Policy') {
              return {
                key: 'Content-Security-Policy',
                value: [
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                  "style-src 'self' 'unsafe-inline'",
                  "img-src 'self' data: https: blob:",
                  "font-src 'self' data:",
                  "connect-src 'self' https://*.niconico.jp https://*.nicovideo.jp",
                  "media-src 'self' https://*.niconico.jp https://*.nicovideo.jp",
                  "object-src 'none'",
                  "base-uri 'self'",
                  "form-action 'self'",
                  "frame-ancestors 'none'",
                ].join('; ')
              }
            }
            return header
          })
        }
      }
      return route
    })
  }
}

export default e2eConfig