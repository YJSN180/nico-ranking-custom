'use client'

import { useState } from 'react'
import { SettingsModal } from './settings-modal'
import { useMobileDetect } from '@/hooks/use-mobile-detect'

export function HeaderWithSettings() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const isMobile = useMobileDetect()

  return (
    <>
      <header role="banner" style={{
        background: 'var(--header-bg)',
        padding: isMobile ? '16px 12px' : '20px',
        boxShadow: 'var(--shadow-md)',
        marginBottom: '24px',
        position: 'relative'
      }}>
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto',
          paddingRight: isMobile ? '48px' : '0' // モバイルで設定ボタンのスペースを確保
        }}>
          <h1 style={{ 
            color: '#ffffff', 
            margin: 0,
            textAlign: 'center',
            fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
            fontWeight: '700',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
            letterSpacing: '0.02em',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
          }}>
            <span style={{
              fontFamily: '"Nicomoji Plus v2", "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif',
              fontSize: '1em'
            }}>ニコニコランキング</span>
            <span style={{
              fontFamily: '"Comic Sans MS Bold", "Comic Sans MS", cursive, sans-serif',
              fontSize: '0.85em',
              marginLeft: '0.2em'
            }}>(Re:turn)</span>
          </h1>
        </div>
        
        <button
          onClick={() => setIsSettingsOpen(true)}
          style={{
            position: 'absolute',
            top: isMobile ? '12px' : '16px',
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
            e.currentTarget.style.transform = 'scale(1.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)'
            e.currentTarget.style.transform = 'scale(1)'
          }}
          aria-label="設定"
        >
          ⚙️
        </button>
      </header>
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </>
  )
}