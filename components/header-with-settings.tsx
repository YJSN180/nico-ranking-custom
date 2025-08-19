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
  
  // Listen for openSettings event from Navigation
  useEffect(() => {
    const handleOpenSettings = () => {
      setIsSettingsOpen(true)
    }
    
    window.addEventListener('openSettings', handleOpenSettings)
    return () => window.removeEventListener('openSettings', handleOpenSettings)
  }, [])

  return (
    <>
      <header role="banner" className={`header-container ${styles.headerResponsive}`} style={{
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