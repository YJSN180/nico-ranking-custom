'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { SettingsModal } from './settings-modal'
import { Navigation } from './navigation'
import { useMobileDetect } from '@/hooks/use-mobile-detect'

export function HeaderWithSettings() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const isMobile = useMobileDetect()
  
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
      <header role="banner" style={{
        background: 'var(--header-bg)',
        padding: isMobile ? '5px 12px' : '8px 20px',
        boxShadow: 'var(--shadow-md)',
        marginBottom: '20px',
        position: 'relative'
      }}>
        <Navigation />
        
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          padding: isMobile ? '0 60px' : '0 120px' // 両サイドのボタンのスペースを確保
        }}>
          <Link 
            href="/" 
            style={{ 
              textDecoration: 'none',
              display: 'block'
            }}
          >
            <h1 style={{ 
              color: '#ffffff', 
              margin: 0,
              textAlign: 'center',
              fontSize: isMobile ? '22px' : '48px',
              fontWeight: '700',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              letterSpacing: '0.02em',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: isMobile ? '4px' : '12px',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isMobile) {
                e.currentTarget.style.opacity = '0.9'
              }
            }}
            onMouseLeave={(e) => {
              if (!isMobile) {
                e.currentTarget.style.opacity = '1'
              }
            }}
            >
              <div style={{
                position: 'relative',
                width: isMobile ? '48px' : '106px',
                height: isMobile ? '48px' : '106px',
                filter: 'brightness(0) invert(1)', // 白色に変換
                opacity: 0.95,
                marginRight: isMobile ? '-5px' : '-20px', // タイトルとやや重なるように
              }}>
                <Image
                  src="/icon.png"
                  alt="ニコラン(Re:turn) ロゴ"
                  fill
                  sizes={isMobile ? "48px" : "106px"}
                  style={{
                    objectFit: 'contain'
                  }}
                  priority
                />
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                flexWrap: 'nowrap',
                whiteSpace: 'nowrap'
              }}>
                <span style={{
                  fontFamily: '"Nicomoji Plus v2"',
                  fontSize: 'inherit'
                }}>ニコラン</span>
                <span style={{
                  fontFamily: '"Comic Sans MS Bold"',
                  fontSize: '85%',
                  marginLeft: '0.05em'
                }}>(Re:turn)</span>
              </div>
            </h1>
          </Link>
        </div>
        
        <button
          onClick={() => setIsSettingsOpen(true)}
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            right: isMobile ? '12px' : '16px',
            background: 'rgba(255, 255, 255, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '6px',
            padding: isMobile ? '4px 8px' : '6px 10px',
            color: 'white',
            fontSize: isMobile ? '16px' : '18px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.35)'
            e.currentTarget.style.transform = 'translateY(-50%) scale(1.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)'
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
          }}
          aria-label="設定"
        >
          ⚙️
        </button>
      </header>
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        onApply={() => {
          // NG適用時に再取得を通知
          window.dispatchEvent(new CustomEvent('ngListApplied'))
        }}
      />
    </>
  )
}