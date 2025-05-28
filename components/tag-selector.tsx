'use client'

import { useState, useEffect } from 'react'
import { getPopularTags } from '@/lib/popular-tags'
import type { RankingConfig } from '@/types/ranking-config'

interface TagSelectorProps {
  config: RankingConfig
  onConfigChange: (config: RankingConfig) => void
}

export function TagSelector({ config, onConfigChange }: TagSelectorProps) {
  const [popularTags, setPopularTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  
  // 「すべて」タグを常に含める
  const ALL_TAG = 'すべて'

  // ジャンルが変更されたときに人気タグを取得
  useEffect(() => {
    // キュレーションされたタグを即座に取得
    const tags = getPopularTags(config.genre, 15)
    setPopularTags(tags)
  }, [config.genre])

  const handleTagSelect = (tag: string) => {
    if (tag === ALL_TAG) {
      // 「すべて」を選択した場合はタグをクリア
      onConfigChange({ ...config, tag: undefined })
    } else {
      // 同じタグを選択した場合は解除（「すべて」を選択した状態に戻る）
      const newTag = config.tag === tag ? undefined : tag
      onConfigChange({ ...config, tag: newTag })
    }
  }

  const clearTag = () => {
    onConfigChange({ ...config, tag: undefined })
  }


  if (popularTags.length === 0) {
    return null
  }

  return (
    <div style={{
      padding: '16px',
      background: 'white',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      marginBottom: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>
          人気タグ
        </h3>
        {config.tag && (
          <button
            onClick={clearTag}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              background: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            クリア
          </button>
        )}
      </div>
      
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '8px'
      }}>
        {/* 「すべて」タグを最初に表示 */}
        <button
          onClick={() => handleTagSelect(ALL_TAG)}
          style={{
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: '500',
            border: '1px solid',
            borderColor: !config.tag ? '#667eea' : '#e5e5e5',
            background: !config.tag ? '#667eea' : 'white',
            color: !config.tag ? 'white' : '#333',
            borderRadius: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap'
          }}
        >
          {ALL_TAG}
        </button>
        
        {/* 人気タグを表示 */}
        {popularTags.map((tag) => (
          <button
            key={tag}
            onClick={() => handleTagSelect(tag)}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: '500',
              border: '1px solid',
              borderColor: config.tag === tag ? '#667eea' : '#e5e5e5',
              background: config.tag === tag ? '#667eea' : 'white',
              color: config.tag === tag ? 'white' : '#333',
              borderRadius: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  )
}