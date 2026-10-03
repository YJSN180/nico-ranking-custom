'use client'

import { useEffect, useRef, useState } from 'react'
import { showToast } from '@/lib/toast'

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false)
  // 「一度オフラインになってから復帰した」ときだけトーストを出す
  const wasOfflineRef = useRef(false)

  useEffect(() => {
    // Check initial online status
    setIsOffline(!navigator.onLine)
    wasOfflineRef.current = !navigator.onLine

    const handleOnline = () => {
      setIsOffline(false)
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false
        // オンライン復帰トースト（UX改善計画 フェーズ5-2）
        showToast('オンラインに復帰しました', 'success')
      }
    }
    const handleOffline = () => {
      wasOfflineRef.current = true
      setIsOffline(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      className="offline-indicator"
      data-testid="offline-indicator"
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'var(--error-color, #ff4444)',
        color: 'var(--button-text-active, #ffffff)',
        padding: '8px 16px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        zIndex: 1000,
        boxShadow: 'var(--shadow-lg, 0 2px 8px rgba(0,0,0,0.2))'
      }}
    >
      <span aria-hidden="true">⚠️</span>
      <span>オフライン</span>
    </div>
  )
}