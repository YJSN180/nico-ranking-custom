'use client'

import { useEffect } from 'react'
import { captureWebException } from '@/lib/sentry/capture'

type GlobalErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    captureWebException(error, {
      tags: {
        runtime: 'browser',
        surface: 'global-error',
        endpoint_family: 'app-router',
      },
    })
  }, [error])

  return (
    <html lang="ja">
      <body>
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            background: '#f7f7f8',
            color: '#222',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              textAlign: 'center',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '24px',
            }}
          >
            <h1 style={{ margin: '0 0 12px', fontSize: '24px' }}>エラーが発生しました</h1>
            <p style={{ margin: '0 0 16px', lineHeight: 1.6 }}>
              読み込みに失敗しました。しばらくしてから再試行してください。
            </p>
            <button
              onClick={() => reset()}
              style={{
                border: 'none',
                borderRadius: '8px',
                background: '#2563eb',
                color: '#fff',
                padding: '10px 16px',
                cursor: 'pointer',
              }}
            >
              再試行
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
