'use client'

import { useState, useEffect } from 'react'
import { SettingsModal } from './settings-modal'
import { Navigation } from './navigation'

interface HeaderInteractiveProps {
  isMobile: boolean
}

export function HeaderInteractive({ isMobile }: HeaderInteractiveProps) {
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
      <Navigation />
      <button
        onClick={() => setIsSettingsOpen(true)}
        style={{
          position: 'absolute',
          top: '0',
          bottom: '0',
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
          zIndex: 10,
          margin: 'auto',
          height: 'fit-content'
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
        role="button"
      >
        ⚙️
      </button>
      
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