module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'ready on',
      startServerReadyTimeout: 30000,
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1
        },
        screenEmulation: {
          mobile: false,
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1,
          disabled: false
        }
      }
    },
    assert: {
      assertions: {
        // パフォーマンス
        'categories:performance': ['error', { minScore: 0.8 }],
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        
        // アクセシビリティ
        'categories:accessibility': ['error', { minScore: 0.9 }],
        
        // ベストプラクティス
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        
        // SEO
        'categories:seo': ['error', { minScore: 0.9 }],
        
        // 特定の監査項目
        'uses-webp-images': 'off', // WebPは任意
        'uses-http2': 'off', // 開発環境では無視
        'is-crawlable': 'error',
        'meta-description': 'error',
        'document-title': 'error',
        'html-has-lang': 'error',
        'color-contrast': ['error', { minScore: 0.9 }],
        'heading-order': ['warn', { minScore: 0.9 }],
        'image-alt': 'error',
        'link-name': 'error',
        'button-name': 'error',
        'label': 'error'
      }
    },
    upload: {
      target: 'temporary-public-storage'
    }
  }
}