'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { SettingsModal } from './settings-modal'
import { Navigation } from './navigation'
import { cn } from '@/lib/responsive-utils'
import styles from './header-with-settings.module.css'

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
      <header role="banner" className={styles.headerContainer}>
        <Navigation />
        
        <div className={styles.headerContent}>
          <Link 
            href="/" 
            style={{ 
              textDecoration: 'none',
              display: 'block'
            }}
          >
            <h1 className={styles.headerTitle}>
              <div className={styles.logoWrapper}>
                <Image
                  src="/icon.png"
                  alt="ニコラン(Re:turn) ロゴ"
                  fill
                  sizes="(max-width: 640px) 48px, 106px"
                  style={{
                    objectFit: 'contain',
                    filter: 'brightness(0) invert(1)', // 白色に変換
                    opacity: 0.95,
                  }}
                  priority
                  unoptimized={true} // Next.js最適化を無効化（402エラー回避）
                />
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                flexWrap: 'nowrap',
                whiteSpace: 'nowrap'
              }}>
                <span style={{
                  fontFamily: '"Nicomoji Plus v2", "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Meiryo", sans-serif',
                  fontSize: 'inherit'
                }}>ニコラン</span>
                <span style={{
                  fontFamily: '"Comic Sans MS Bold", Arial, sans-serif',
                  fontSize: '85%',
                  marginLeft: '0.05em'
                }}>(Re:turn)</span>
              </div>
            </h1>
          </Link>
        </div>
        
        <button
          onClick={() => setIsSettingsOpen(true)}
          className={styles.settingsButton}
          aria-label="設定"
        >
          ⚙️
        </button>
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