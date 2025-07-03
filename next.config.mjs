import bundleAnalyzer from '@next/bundle-analyzer'
import withPWA from 'next-pwa'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 本番でのソースマップ無効化（セキュリティ・パフォーマンス向上）
  productionBrowserSourceMaps: false,
  // React Server Components最適化
  serverExternalPackages: ['pako'],
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
    // Script Evaluation最適化
    optimizePackageImports: ['react', 'react-dom', 'react-icons', 'lodash', 'date-fns'],
    // 実験的な最適化機能
    webVitalsAttribution: ['CLS', 'LCP', 'FCP', 'FID', 'TTFB'],
    // より積極的なツリーシェイキング
    serverMinification: true,
    // 新しい最適化フラグ
    gzipSize: false, // ビルド時間短縮
    // クライアントキャッシュ最適化
    optimisticClientCache: true,
    // モジュール解決最適化
    fullySpecified: false,
  },
  // パフォーマンス最適化設定
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  poweredByHeader: false,
  compress: true,
  // ビルド時のメモリ最適化とJavaScript削減
  webpack: (config, { isServer, webpack }) => {
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
      
      // 不要なモジュールを除外（サーバーサイドのみで使用）
      config.externals = {
        ...config.externals,
        '@cloudflare/workers-types': 'commonjs @cloudflare/workers-types',
        'wrangler': 'commonjs wrangler',
        '@aws-sdk/client-s3': 'commonjs @aws-sdk/client-s3',
        'fast-xml-parser': 'commonjs fast-xml-parser',
      }
      
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 10000, // より小さなチャンクを許可
        maxSize: 50000, // より積極的な分割（50KB）
        minRemainingSize: 0,
        minChunks: 1,
        maxAsyncRequests: 50, // 並列リクエスト数を増加
        maxInitialRequests: 50,
        automaticNameDelimiter: '-',
        cacheGroups: {
          default: false,
          vendors: false,
          // React関連の基本フレームワーク（さらに分割）
          react: {
            name: 'react',
            test: /[\\/]node_modules[\\/]react[\\/]/,
            priority: 55,
            chunks: 'all',
            enforce: true,
            reuseExistingChunk: true
          },
          'react-dom': {
            name: 'react-dom',
            test: /[\\/]node_modules[\\/]react-dom[\\/]/,
            priority: 54,
            chunks: 'all',
            enforce: true,
            reuseExistingChunk: true
          },
          scheduler: {
            name: 'scheduler',
            test: /[\\/]node_modules[\\/](scheduler|prop-types|use-sync-external-store)[\\/]/,
            priority: 53,
            chunks: 'all',
            enforce: true,
            reuseExistingChunk: true
          },
          // Next.js関連
          nextjs: {
            name: 'nextjs',
            test: /[\\/]node_modules[\\/](next|@next)[\\/]/,
            priority: 45,
            chunks: 'all',
            enforce: true
          },
          // ポリフィル（初期ロードで必要）
          polyfills: {
            name: 'polyfills',
            test: /[\\/]node_modules[\\/](core-js|regenerator-runtime|@babel\/runtime)[\\/]/,
            priority: 40,
            chunks: 'initial',
            enforce: true
          },
          // 共通ライブラリ
          commons: {
            name: 'commons',
            chunks: 'all',
            minChunks: 2,
            priority: 10,
            reuseExistingChunk: true,
            maxSize: 30000 // 30KB以下に分割
          },
          // ベンダーライブラリ（遅延ロード可能）
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name(module) {
              if (!module.context) return 'vendor'
              
              const match = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)
              if (!match) return 'vendor'
              
              const packageName = match[1]
              // 重要なパッケージは個別チャンクに
              const importantPackages = ['lodash', 'date-fns', 'axios', 'swr']
              if (importantPackages.some(pkg => packageName.includes(pkg))) {
                return `vendor-${packageName.replace('@', '')}`
              }
              
              // その他は vendor-misc にまとめる
              return 'vendor-misc'
            },
            chunks: 'async', // 非同期チャンクのみ
            priority: 20,
            maxSize: 30000 // 30KB以下に分割
          },
          // スタイル（CSS in JS）
          styles: {
            name: 'styles',
            test: /\.(css|scss|sass)$/,
            chunks: 'all',
            priority: 15,
            enforce: true
          }
        }
      }
      
      // 使用していないexportsを削除（本番ビルドのみ）
      if (process.env.NODE_ENV === 'production') {
        config.optimization.usedExports = true
        config.optimization.sideEffects = false
        
        // より積極的な最適化
        config.optimization.minimize = true
        config.optimization.concatenateModules = true
        config.optimization.innerGraph = true
        config.optimization.providedExports = true
        config.optimization.realContentHash = true
        config.optimization.mangleExports = true
        config.optimization.removeAvailableModules = true
        config.optimization.removeEmptyChunks = true
        config.optimization.runtimeChunk = {
          name: (entrypoint) => `runtime-${entrypoint.name}`,
        }
        
        // TerserPlugin設定のカスタマイズ
        const TerserPlugin = config.optimization.minimizer?.find(
          (plugin) => plugin.constructor.name === 'TerserPlugin'
        )
        
        if (TerserPlugin) {
          TerserPlugin.options.terserOptions = {
            ...TerserPlugin.options.terserOptions,
            compress: {
              ...TerserPlugin.options.terserOptions?.compress,
              drop_console: true,
              drop_debugger: true,
              pure_funcs: ['console.log', 'console.info', 'console.debug'],
              passes: 3, // より積極的な圧縮
              ecma: 2020,
              module: true,
              toplevel: true,
              unsafe_math: true,
              unsafe_methods: true,
              unsafe_proto: true,
              unsafe_regexp: true,
            },
            mangle: {
              ...TerserPlugin.options.terserOptions?.mangle,
              safari10: true,
              properties: {
                regex: /^_/,
              },
            },
            format: {
              ...TerserPlugin.options.terserOptions?.format,
              comments: false,
              ecma: 2020,
            },
          }
        }
        
        // Node.js polyfillsを完全に無効化
        config.resolve.alias = {
          ...config.resolve.alias,
          'process': false,
          'buffer': false,
          'stream': false,
        }
      }
      
      // DefinePluginでprocess.envを静的に置換
      config.plugins.push(
        new webpack.DefinePlugin({
          'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
          'process.browser': true,
          'process': JSON.stringify({ env: { NODE_ENV: process.env.NODE_ENV || 'production' } }),
        })
      )
      
      // IgnorePluginで不要なモジュールを除外
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^(fs|net|tls|crypto|stream|os|path|zlib|http|https|url|util|buffer|querystring|events|child_process|cluster|dgram|dns|domain|readline|repl|tty|vm)$/,
          contextRegExp: /./,
        })
      )
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