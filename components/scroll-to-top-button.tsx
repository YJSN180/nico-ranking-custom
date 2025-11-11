'use client'

import { useEffect, useRef, useState } from 'react'

const SCROLL_THRESHOLD = 600

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false)
  const scrollListenerRef = useRef<() => void>(() => {})

  useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setIsVisible(window.scrollY > SCROLL_THRESHOLD)
        ticking = false
      })
    }

    scrollListenerRef.current = handleScroll
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => {
      if (scrollListenerRef.current) {
        window.removeEventListener('scroll', scrollListenerRef.current)
      }
    }
  }, [])

  if (!isVisible) return null

  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <button
      type="button"
      aria-label="ページ最上部へ戻る"
      onClick={() => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
      }}
      style={{
        position: 'fixed',
        right: 'clamp(12px, 2vw, 32px)',
        bottom: 'clamp(12px, 2vw, 32px)',
        zIndex: 1000,
        border: 'none',
        borderRadius: '999px',
        backgroundColor: 'var(--primary-color)',
        color: 'var(--button-text-active)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        width: '48px',
        height: '48px',
        cursor: 'pointer',
        fontSize: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.2s ease, opacity 0.2s ease',
        opacity: 0.95
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.05)'
        e.currentTarget.style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
        e.currentTarget.style.opacity = '0.95'
      }}
    >
      ▲
    </button>
  )
}
