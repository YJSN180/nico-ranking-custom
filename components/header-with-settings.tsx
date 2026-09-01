'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { SettingsModal } from './settings-modal'
import { Navigation } from './navigation'
import { ReloadButton } from './reload-button'
import styles from './header.module.css'

export function HeaderWithSettings() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  // モバイル用stickyヘッダー: 下スクロールで隠し、上スクロールで再表示（フェーズ3-2）
  const [isHeaderHidden, setIsHeaderHidden] = useState(false)

  // Listen for openSettings event from Navigation
  useEffect(() => {
    const handleOpenSettings = () => {
      setIsSettingsOpen(true)
    }

    window.addEventListener('openSettings', handleOpenSettings)
    return () => window.removeEventListener('openSettings', handleOpenSettings)
  }, [])

  // スクロール方向でヘッダーの表示/非表示を切り替える。
  // モバイル(≤640px)限定: PC版のヘッダー挙動は現状維持する
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mediaQuery = window.matchMedia('(max-width: 640px)')

    let lastY = window.scrollY
    let ticking = false
    const THRESHOLD = 8 // 微小スクロールでの明滅を防ぐ

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        if (!mediaQuery.matches) {
          setIsHeaderHidden(false)
          return
        }
        const y = window.scrollY
        const dy = y - lastY
        if (y <= 64) {
          setIsHeaderHidden(false)
        } else if (dy > THRESHOLD) {
          setIsHeaderHidden(true)
        } else if (dy < -THRESHOLD) {
          setIsHeaderHidden(false)
        }
        lastY = y
      })
    }

    const onMediaChange = () => {
      if (!mediaQuery.matches) setIsHeaderHidden(false)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    mediaQuery.addEventListener('change', onMediaChange)
    return () => {
      window.removeEventListener('scroll', onScroll)
      mediaQuery.removeEventListener('change', onMediaChange)
    }
  }, [])

  return (
    <>
      <header
        role="banner"
        className={`header-container ${styles.headerResponsive} ${styles.stickyMobile}`}
        data-hidden={isHeaderHidden || undefined}
        style={{
        background: 'var(--header-bg)',
        boxShadow: 'var(--shadow-md)',
        marginBottom: '20px',
      }}>
        <Navigation />
        
        <div className={styles.headerContent} style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          padding: '0 60px' // CSS handles responsive padding
        }}>
          <Link 
            href="/" 
            className={styles.headerTitle}
          >
            <h1 style={{ 
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}>
              <div className={styles.logoContainer}>
                <Image
                  src="/icon.svg"
                  alt="ニコラン(Re:turn) ロゴ"
                  fill
                  sizes="(max-width: 640px) 48px, 106px"
                  style={{
                    objectFit: 'contain',
                    opacity: 0.95,
                  }}
                  priority
                  unoptimized={true}
                />
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                flexWrap: 'nowrap',
                whiteSpace: 'nowrap'
              }}>
                <span className={styles.titleMain}>ニコラン</span>
                <span className={styles.titleSub}>(Re:turn)</span>
              </div>
            </h1>
          </Link>
        </div>
        
        <div className={styles.headerButtons}>
          <ReloadButton />
          <button
            onClick={() => setIsSettingsOpen(true)}
            className={styles.settingsButton}
            aria-label="設定"
          >
            ⚙️
          </button>
        </div>
      </header>
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        onApply={() => {
          // NGリストの適用は、useUserNGListフックのngListUpdatedイベントで
          // 自動的に処理されるため、追加のイベント発火は不要
        }}
      />
    </>
  )
}