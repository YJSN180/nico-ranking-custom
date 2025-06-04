'use client'

import { useState } from 'react'
import { SettingsModal } from './settings-modal'

export function HeaderWithSettings() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  return (
    <>
      <header style={{
        background: 'linear-gradient(135deg, #0080ff 0%, #00bfff 100%)',
        padding: '32px 20px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        marginBottom: '32px',
        position: 'relative'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ 
            color: '#ffffff', 
            marginBottom: '4px',
            textAlign: 'center',
            fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
            fontWeight: '700',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
            letterSpacing: '0.02em',
            fontFamily: '"Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif'
          }}>ニコニコランキング(Re:turn)</h1>
          <p style={{
            color: 'rgba(255, 255, 255, 0.95)',
            textAlign: 'center',
            fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
            margin: 0,
            fontFamily: '"Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif'
          }}>
            最新の人気動画をチェック
          </p>
        </div>
        
        <button
          onClick={() => setIsSettingsOpen(true)}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255, 255, 255, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            borderRadius: '6px',
            padding: '6px 10px',
            color: 'white',
            fontSize: '18px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)'
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