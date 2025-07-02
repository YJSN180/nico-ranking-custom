'use client'

import { useEffect, useState } from 'react'

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false)
  
  useEffect(() => {
    // Check initial online status
    setIsOffline(!navigator.onLine)
    
    // Handle online/offline events
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
  
  if (!isOffline) return null
  
  return (
    <div 
      className="offline-indicator"
      data-testid="offline-indicator"
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: '#ff4444',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        zIndex: 1000,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
      }}
    >
      <span>⚠️</span>
      <span>オフライン</span>
    </div>
  )
}