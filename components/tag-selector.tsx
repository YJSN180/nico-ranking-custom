'use client'

import { useState, useEffect } from 'react'
import { getPopularTags } from '@/lib/popular-tags'
import type { RankingConfig } from '@/types/ranking-config'

interface TagSelectorProps {
  config: RankingConfig
  onConfigChange: (config: RankingConfig) => void
  popularTags?: string[]
}

export function TagSelector({ config, onConfigChange, popularTags: propsTags = [] }: TagSelectorProps) {
  const [popularTags, setPopularTags] = useState<string[]>(propsTags)
  const [loading, setLoading] = useState(false)

  // propsから渡されたタグを使用、なければAPIから取得
  useEffect(() => {
    if (propsTags.length > 0) {
      setPopularTags(propsTags)
      setLoading(false)
      return
    }

    async function loadTags() {
      // 総合ランキングの場合はタグを表示しない
      if (config.genre === 'all') {
        setPopularTags([])
        setLoading(false)
        return
      }
      
      setLoading(true)
      try {
        // 動的に人気タグを取得（キャッシュ付き）
        const tags = await getPopularTags(config.genre)
        setPopularTags(tags)
      } catch (error) {
        // フォールバックとして空配列を設定
        setPopularTags([])
      } finally {
        setLoading(false)
      }
    }

    loadTags()
  }, [config.genre, propsTags])

  const handleTagSelect = (tag: string) => {
    if (tag === 'すべて') {
      // 「すべて」を選択した場合はタグをクリア
      onConfigChange({ ...config, tag: undefined })
    } else {
      // 同じタグを選択した場合は解除
      const newTag = config.tag === tag ? undefined : tag
      onConfigChange({ ...config, tag: newTag })
    }
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
        <h3 style={{ 
          fontSize: '14px', 
          fontWeight: '600', 
          marginBottom: '8px', 
          color: '#333',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}>
          人気タグ
        </h3>
        <div style={{ color: '#666', fontSize: '14px' }}>
          タグを読み込み中...
        </div>
      </div>
    )
  }

  // 総合ランキングの場合は何も表示しない
  if (config.genre === 'all') {
    return null
  }
  
  // 常に表示（「すべて」タグを含める）
  return (
    <div style={{
      padding: '16px',
      background: 'white',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      marginBottom: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ 
          fontSize: '14px', 
          fontWeight: '600', 
          color: '#333', 
          margin: 0,
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}>
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
            borderRadius: '4px',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
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
        {/* 「すべて」タグを最初に表示 */}
        <button
          onClick={() => handleTagSelect('すべて')}
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
          すべて
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