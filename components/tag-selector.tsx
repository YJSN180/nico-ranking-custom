'use client'

import { useState, useEffect } from 'react'
import { fetchPopularTags } from '@/lib/nico-api'
import type { RankingConfig } from '@/types/ranking-config'

interface TagSelectorProps {
  config: RankingConfig
  onConfigChange: (config: RankingConfig) => void
}

export function TagSelector({ config, onConfigChange }: TagSelectorProps) {
  const [popularTags, setPopularTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // ジャンルが変更されたときに人気タグを取得
  useEffect(() => {
    const loadPopularTags = async () => {
      setLoading(true)
      try {
        const tags = await fetchPopularTags(config.genre, 15)
        setPopularTags(tags)
      } catch (error) {
        console.error('Failed to load popular tags:', error)
        setPopularTags([])
      } finally {
        setLoading(false)
      }
    }

    loadPopularTags()
  }, [config.genre])

  const handleTagSelect = (tag: string) => {
    // 同じタグを選択した場合は解除
    const newTag = config.tag === tag ? undefined : tag
    onConfigChange({ ...config, tag: newTag })
  }

  const clearTag = () => {
    onConfigChange({ ...config, tag: undefined })
  }

  if (loading) {
    return (
      <div style={{
        padding: '16px',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: '16px'
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#333' }}>
          人気タグ
        </h3>
        <div style={{ color: '#666', fontSize: '14px' }}>
          タグを読み込み中...
        </div>
      </div>
    )
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
      
      {config.tag && (
        <div style={{ marginBottom: '12px' }}>
          <span style={{ 
            fontSize: '12px', 
            color: '#666',
            background: '#f0f0f0',
            padding: '4px 8px',
            borderRadius: '4px'
          }}>
            選択中: {config.tag}
          </span>
        </div>
      )}

      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '8px'
      }}>
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