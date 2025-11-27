import bundleAnalyzer from '@next/bundle-analyzer'

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
      // API ranking は完全 no-store
      {
        source: '/api/ranking',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        ]
      },
      {
        source: '/:path*',
        headers: [
          // 開発環境では CSP を緩める
          ...(process.env.NODE_ENV === 'development' ? [{
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-scripts.com https://vercel.live https://static.cloudflareinsights.com https://*.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.niconico.jp https://*.nicovideo.jp https://vitals.vercel-analytics.com https://va.vercel-scripts.com https://nico-rank.com",
              "media-src 'self' https://*.niconico.jp https://*.nicovideo.jp",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests"
            ].join('; ')
          }] : [{
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com https://vercel.live https://static.cloudflareinsights.com https://*.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline'", // CSS-in-JSのため一時的に必要
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.niconico.jp https://*.nicovideo.jp https://vitals.vercel-analytics.com https://va.vercel-scripts.com https://nico-rank.com",
              "media-src 'self' https://*.niconico.jp https://*.nicovideo.jp",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests"
            ].join('; ')
          }]),
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
    // CSS chunking設定: CSSがscriptタグで読み込まれる問題を修正
    cssChunking: 'strict', // CSS順序を厳密に制御し、適切にlinkタグで読み込み
    // メモリ使用量を削減
    workerThreads: false,
    cpus: 1,
    // パフォーマンス最適化
    optimizeCss: true, // crittersをインストールしたため有効化
    // Script Evaluation最適化
    optimizePackageImports: ['react-icons', 'lodash', 'date-fns'],
    // 実験的な最適化機能
    webVitalsAttribution: ['CLS', 'LCP', 'FCP', 'FID', 'TTFB'],
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
          // React関連の基本フレームワーク
          framework: {
            name: 'framework',
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-sync-external-store)[\\/]/,
            priority: 50,
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
          // 注意: CSSファイルはsplitChunksで処理してはいけません
          // Next.jsには既に最適化されたCSS処理機能があります
          // CSSをsplitChunksに含めると<script>タグで読み込まれてしまいます
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
      }
    }
    return config
  },
}

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

export default withBundleAnalyzer(nextConfig)
