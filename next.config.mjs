/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // 外部画像の最適化を無効化
    unoptimized: true,
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
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // メモリ使用量を削減
    workerThreads: false,
    cpus: 1
  },
  // ビルド時のメモリ最適化
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          commons: {
            name: 'commons',
            chunks: 'all',
            minChunks: 2
          }
        }
      }
    }
    return config
  },
}

export default nextConfig