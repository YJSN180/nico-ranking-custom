import bundleAnalyzer from '@next/bundle-analyzer'
import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16ではTurbopackがデフォルトだが、既存のwebpack設定を使用するため無効化
  // TODO: webpack設定をTurbopack互換に移行後、turbopack: trueに変更
  turbopack: false,
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
      // API ranking はキャッシュ禁止（Cloudflare Workerでキャッシュ管理するため、Vercel側はキャッシュしない）
      // 重要: s-maxageを設定すると古いデータ問題が発生するため、no-storeを使用
      {
        source: '/api/ranking',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
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
              "frame-src 'self' https://vercel.live",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.niconico.jp https://*.nicovideo.jp https://vitals.vercel-analytics.com https://va.vercel-scripts.com https://nico-rank.com https://*.ingest.sentry.io",
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
              "connect-src 'self' https://*.niconico.jp https://*.nicovideo.jp https://vitals.vercel-analytics.com https://va.vercel-scripts.com https://nico-rank.com https://*.ingest.sentry.io",
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
      // Note: API route cache headers - キャッシュはCloudflare Worker側で管理
      // Vercel側では一律no-storeにして古いデータ問題を防ぐ
      // 例外: /api/search 系（Snapshot/nvapi プロキシ）はルート自身が短い s-maxage を設定し、
      // CDN キャッシュで上流（ニコニコ）への増幅を抑える（middleware.ts と同じ除外）
      {
        source: '/api/:path((?!search).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate'
          },
          {
            key: 'CDN-Cache-Control',
            value: 'no-store'
          },
          {
            key: 'Vercel-CDN-Cache-Control',
            value: 'no-store'
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
    // CSS chunking: 'strict' は import 順を厳密に保つ代わりに CSS が 10 本前後の小ファイルに
    // 分かれ、すべてレンダリングブロッキングになる（実測: 8〜11 本）。既定(true)は依存関係の
    // ない CSS を結合して本数を減らす（順序依存がある import 同士の順序は維持される）
    cssChunking: true,
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
      
      // 注意: 以前はここで splitChunks を maxSize 30〜50KB に細分化していたが、
      // 初期ロードが 150〜380 本の <script> に分裂し（実測: 本番 387 本）、モバイルの
      // リクエスト過多で LCP を悪化させていたため撤去。Next.js 既定の分割に任せる
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

// クライアントで使っていない Sentry 機能（Session Replay / デバッグ文）をバンドルから落とす
const sentryBundleSizeOptimizations = {
  excludeDebugStatements: true,
  excludeReplayIframe: true,
  excludeReplayShadowDom: true,
  excludeReplayWorker: true,
}

const sentryBuildOptions = process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT_WEB
  ? {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT_WEB,
      telemetry: false,
      silent: true,
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
      disableLogger: true,
      bundleSizeOptimizations: sentryBundleSizeOptimizations,
    }
  : {
      telemetry: false,
      silent: true,
      disableLogger: true,
      bundleSizeOptimizations: sentryBundleSizeOptimizations,
    }

export default withSentryConfig(withBundleAnalyzer(nextConfig), sentryBuildOptions)
