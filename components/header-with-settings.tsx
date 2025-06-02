'use client'

import { useState } from 'react'
import { SettingsModal } from './settings-modal'

export function HeaderWithSettings() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  return (
    <>
      <header style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '40px 20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        marginBottom: '40px',
        position: 'relative'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ 
            color: '#ffffff', 
            marginBottom: '8px',
            textAlign: 'center',
            fontSize: '2.5rem',
            fontWeight: '800',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            letterSpacing: '-0.02em'
          }}>ニコニコランキング</h1>
          <p style={{
            color: 'rgba(255, 255, 255, 0.9)',
            textAlign: 'center',
            fontSize: '1.1rem',
            margin: 0
          }}>
            最新の人気動画をチェック
          </p>
        </div>
        
        <button
          onClick={() => setIsSettingsOpen(true)}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 12px',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
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