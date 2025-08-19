'use client'

import { RefreshCw } from 'lucide-react'
import styles from './pull-to-refresh-indicator.module.css'

interface PullToRefreshIndicatorProps {
  isPulling: boolean
  pullDistance: number
}

export function PullToRefreshIndicator({ isPulling, pullDistance }: PullToRefreshIndicatorProps) {
  if (!isPulling) return null
  
  const progress = Math.min(pullDistance / 80, 1)
  const rotation = progress * 180
  const opacity = Math.min(progress, 0.8)
  
  return (
    <div 
      className={styles.indicator}
      style={{
        transform: `translateY(${pullDistance}px)`,
        opacity
      }}
    >
      <div className={styles.iconWrapper}>
        <RefreshCw 
          size={24}
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 0.2s ease'
          }}
        />
        {progress >= 1 && (
          <span className={styles.text}>離して更新</span>
        )}
      </div>
    </div>
  )
}