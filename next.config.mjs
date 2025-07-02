import bundleAnalyzer from '@next/bundle-analyzer'
import withPWA from 'next-pwa'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 本番でのソースマップ無効化（セキュリティ・パフォーマンス向上）
  productionBrowserSourceMaps: false,
  images: {
    // ローカル画像（ロゴ等）は最適化を有効にしてWebP/AVIF変換
    // 外部画像（ニコニコ動画サムネイル）のみ最適化を無効化
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'nicovideo.cdn.nimg.jp',
      },
      {
        protocol: 'https',
        hostname: 'tn.smilevideo.jp',
      },
      {
        protocol: 'https',
        hostname: 'secure-dcdn.cdn.nimg.jp',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com https://vercel.live https://static.cloudflareinsights.com https://*.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline'", // CSS-in-JSのため一時的に必要
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.niconico.jp https://*.nicovideo.jp",
              "media-src 'self' https://*.niconico.jp https://*.nicovideo.jp",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests"
            ].join('; ')
          },
          // COEP を削除 - ニコニコ動画のサムネイル画像がCORSヘッダーを提供していないため
          // {
          //   key: 'Cross-Origin-Embedder-Policy',
          //   value: 'require-corp'
          // },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin'
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload'
          },
          {
            key: 'Expect-CT',
            value: 'max-age=86400, enforce'
          },
          {
            key: 'Feature-Policy',
            value: "camera 'none'; microphone 'none'; geolocation 'none'; usb 'none'; payment 'none'; fullscreen 'self'"
          }
        ]
      },
      // Note: API route cache headers are now handled by middleware.ts
      // This configuration is kept as a fallback
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=1200, stale-while-revalidate=2400' // Updated to 20min
          }
        ]
      },
      // Cache headers for static assets
      {
        source: '/(.*)\\.(png|jpg|jpeg|gif|ico|svg|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, immutable'
          }
        ]
      }
    ]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // メモリ使用量を削減
    workerThreads: false,
    cpus: 1,
    // パフォーマンス最適化
    optimizeCss: true, // crittersをインストールしたため有効化
  },
  // パフォーマンス最適化設定
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  poweredByHeader: false,
  compress: true,
  // ビルド時のメモリ最適化とJavaScript削減
  webpack: (config, { isServer }) => {
    // クライアントサイドバンドルからサーバー専用モジュールを除外
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        util: false,
        zlib: false,
        http: false,
        https: false,
        url: false,
      }
      
      // 不要なモジュールを除外
      config.externals = {
        ...config.externals,
        '@cloudflare/workers-types': 'commonjs @cloudflare/workers-types',
        'wrangler': 'commonjs wrangler',
      }
      
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 20000,
        maxSize: 200000, // さらに小さく分割
        minRemainingSize: 0,
        minChunks: 1,
        maxAsyncRequests: 30,
        maxInitialRequests: 30,
        cacheGroups: {
          default: false,
          vendors: false,
          framework: {
            name: 'framework',
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-sync-external-store)[\\/]/,
            priority: 40,
            chunks: 'all',
            enforce: true
          },
          commons: {
            name: 'commons',
            chunks: 'all',
            minChunks: 2,
            priority: 10,
            reuseExistingChunk: true
          },
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name(module) {
              // module.contextがない場合のフォールバック
              if (!module.context) return 'vendor'
              
              const match = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)
              if (!match) return 'vendor'
              
              const packageName = match[1]
              return `vendor-${packageName.replace('@', '')}`
            },
            chunks: 'all',
            priority: 20
          }
        }
      }
      
      // 使用していないexportsを削除（本番ビルドのみ）
      if (process.env.NODE_ENV === 'production') {
        config.optimization.usedExports = true
        config.optimization.sideEffects = false
      }
    }
    return config
  },
}

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

// PWA configuration
const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  clientsClaim: true,
  disable: process.env.NODE_ENV === 'development' && process.env.ENABLE_PWA !== 'true',
  fallbacks: {
    document: '/offline.html'
  },
  additionalManifestEntries: [
    { url: '/offline.html', revision: '1' }
  ],
  buildExcludes: [/app-build-manifest\.json$/],
  // Workbox configuration
  runtimeCaching: [
    // API routes - StaleWhileRevalidate for ranking data
    {
      urlPattern: /^\/api\/ranking/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'ranking-api',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 20 * 60 // 20 minutes
        }
      }
    },
    // Mylist API - NetworkFirst for data integrity
    {
      urlPattern: /^\/api\/mylists/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'mylist-api',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60 // 5 minutes
        },
        networkTimeoutSeconds: 3
      }
    },
    // External API (Niconico)
    {
      urlPattern: /^https:\/\/(nicovideo\.cdn\.nimg\.jp|tn\.smilevideo\.jp|secure-dcdn\.cdn\.nimg\.jp)/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'niconico-assets',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
        }
      }
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts-webfonts',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 365 * 24 * 60 * 60 // 365 days
        }
      }
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'google-fonts-stylesheets',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
        }
      }
    },
    {
      urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-font-assets',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
        }
      }
    },
    {
      urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp|avif)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-image-assets',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        }
      }
    },
    {
      urlPattern: /\/_next\/image\?url=.+$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-image',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        }
      }
    },
    {
      urlPattern: /\.(?:mp3|wav|ogg)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-audio-assets',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        }
      }
    },
    {
      urlPattern: /\.(?:mp4)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-video-assets',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        }
      }
    },
    {
      urlPattern: /\.(?:js)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-js-assets',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        }
      }
    },
    {
      urlPattern: /\.(?:css|less)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-style-assets',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        }
      }
    },
    {
      urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-data',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        }
      }
    },
    {
      urlPattern: /\.(?:json|xml|csv)$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'static-data-assets',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        }
      }
    },
    {
      urlPattern: ({ url }) => {
        const isSameOrigin = self.origin === url.origin
        if (!isSameOrigin) return false
        const pathname = url.pathname
        if (pathname.startsWith('/api/')) return false
        return true
      },
      handler: 'NetworkFirst',
      options: {
        cacheName: 'others',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        },
        networkTimeoutSeconds: 10
      }
    },
    {
      urlPattern: ({ url }) => {
        const isSameOrigin = self.origin === url.origin
        return !isSameOrigin
      },
      handler: 'NetworkFirst',
      options: {
        cacheName: 'cross-origin',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 60 * 60 // 1 hour
        },
        networkTimeoutSeconds: 10
      }
    }
  ]
})

export default withBundleAnalyzer(pwaConfig(nextConfig))