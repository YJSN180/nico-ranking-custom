'use client'

import { useState, useEffect } from 'react'

interface VideoTagsProps {
  tags: string[] | undefined
  isMobile: boolean
}

// タグ表示専用コンポーネント（クライアントサイドのみでレンダリング）
export default function VideoTags({ tags, isMobile }: VideoTagsProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // サーバーサイドレンダリング時は何も表示しない
  if (!mounted || isMobile || !tags || tags.length === 0) {
    return null
  }

  return (
    <div style={{ 
      display: 'flex', 
      gap: '6px', 
      marginTop: '8px',
      flexWrap: 'wrap',
      fontSize: '12px'
    }}>
      {tags.slice(0, 5).map((tag, index) => (
        <span 
          key={index}
          style={{
            padding: '2px 8px',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            borderRadius: '4px',
            border: '1px solid var(--border-color)',
            whiteSpace: 'nowrap'
          }}
        >
          {tag}
        </span>
      ))}
      {tags.length > 5 && (
        <span style={{
          color: 'var(--text-muted)',
          alignSelf: 'center'
        }}>
          +{tags.length - 5}
        </span>
      )}
    </div>
  )
}