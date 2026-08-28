'use client'

import { useEffect, useRef, useState } from 'react'
import { TOAST_EVENT, type ToastPayload } from '@/lib/toast'
import './toast-viewport.css'

interface ToastItem extends ToastPayload {
  id: number
  leaving: boolean
}

const MAX_VISIBLE_TOASTS = 3
const AUTO_DISMISS_MS = 3200
const LEAVE_ANIMATION_MS = 200

const TYPE_ICONS: Record<ToastPayload['type'], string> = {
  success: '✓',
  info: 'ℹ',
  error: '⚠',
}

// トーストの表示側。app/layout.tsx に1つだけマウントする
export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()

    const dismiss = (id: number) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
      const removeTimer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, LEAVE_ANIMATION_MS)
      timers.add(removeTimer)
    }

    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastPayload>).detail
      if (!detail?.message) return
      idRef.current += 1
      const id = idRef.current
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE_TOASTS - 1)), { ...detail, id, leaving: false }])
      const dismissTimer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
      timers.add(dismissTimer)
    }

    window.addEventListener(TOAST_EVENT, handleToast)
    return () => {
      window.removeEventListener(TOAST_EVENT, handleToast)
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.type}${toast.leaving ? ' toast--leaving' : ''}`}
        >
          <span className="toast__icon" aria-hidden="true">
            {TYPE_ICONS[toast.type]}
          </span>
          <span className="toast__message">{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
