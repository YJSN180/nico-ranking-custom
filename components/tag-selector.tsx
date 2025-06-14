'use client'

import { useState, useEffect, useRef } from 'react'
import type { RankingConfig } from '@/types/ranking-config'
import { useMobileDetect } from '@/hooks/use-mobile-detect'

interface TagSelectorProps {
  config: RankingConfig
  onConfigChange: (config: RankingConfig) => void
  popularTags?: string[]
}

export function TagSelector({ config, onConfigChange, popularTags: propsTags = [] }: TagSelectorProps) {
  const [popularTags, setPopularTags] = useState<string[]>(propsTags)
  const [loading, setLoading] = useState(false)
  const isMobile = useMobileDetect()
  const tagScrollRef = useRef<HTMLDivElement>(null)
  const selectedTagRef = useRef<HTMLButtonElement>(null)

  // propsから渡されたタグを優先的に使用
  useEffect(() => {
    // propsTagsが変更されたら常に反映
    setPopularTags(propsTags)
    setLoading(false)
  }, [propsTags])

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

  // 選択されたタグを中央にスクロール
  useEffect(() => {
    if (isMobile && selectedTagRef.current && tagScrollRef.current) {
      const container = tagScrollRef.current
      const selected = selectedTagRef.current
      const containerWidth = container.offsetWidth
      const selectedLeft = selected.offsetLeft
      const selectedWidth = selected.offsetWidth
      const scrollPosition = selectedLeft - (containerWidth / 2) + (selectedWidth / 2)
      
      container.scrollTo({ left: scrollPosition, behavior: 'smooth' })
    }
  }, [config.tag, isMobile])

  const clearTag = () => {
    onConfigChange({ ...config, tag: undefined })
  }

  if (loading) {
    return (
      <div style={{
        padding: '16px',
        background: 'var(--surface-color)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-md)',
        marginBottom: '16px'
      }}>
        <h3 style={{ 
          fontSize: '14px', 
          fontWeight: '600', 
          marginBottom: '8px', 
          color: 'var(--text-primary)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}>
          人気タグ
        </h3>
        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          タグを読み込み中...
        </div>
      </div>
    )
  }

  // 総合ジャンルの場合は人気タグセクションを表示しない
  if (config.genre === 'all') {
    return null
  }
  
  // 常に表示（「すべて」タグを含める）
  return (
    <div style={{
      padding: '16px',
      background: 'var(--surface-color)',
      borderRadius: '8px',
      boxShadow: 'var(--shadow-md)',
      marginBottom: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ 
          fontSize: '14px', 
          fontWeight: '600', 
          color: 'var(--text-primary)', 
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
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              cursor: 'pointer',
              color: 'var(--text-secondary)'
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
            color: 'var(--text-secondary)',
            background: 'var(--surface-hover)',
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

      {isMobile ? (
        <div style={{ position: 'relative' }}>
          {/* 左端のグラデーション */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '20px',
            background: 'linear-gradient(to right, var(--surface-color), transparent)',
            zIndex: 1,
            pointerEvents: 'none'
          }} />
          {/* 右端のグラデーション */}
          <div style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '20px',
            background: 'linear-gradient(to left, var(--surface-color), transparent)',
            zIndex: 1,
            pointerEvents: 'none'
          }} />
          <div
            ref={tagScrollRef}
            style={{ 
              display: 'flex', 
              gap: '8px',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              paddingBottom: '2px'
            }}
          >
            {/* 「すべて」タグを最初に表示 */}
            <button
              ref={!config.tag ? selectedTagRef : null}
              onClick={() => handleTagSelect('すべて')}
              style={{
                padding: !config.tag ? '8px 16px' : '6px 12px',
                fontSize: !config.tag ? '14px' : '13px',
                fontWeight: '600',
                border: '1px solid',
                borderColor: !config.tag ? 'var(--primary-color)' : 'var(--border-color)',
                background: !config.tag ? 'var(--primary-color)' : 'var(--surface-color)',
                color: !config.tag ? 'var(--button-text-active)' : 'var(--text-primary)',
                borderRadius: '20px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transform: !config.tag ? 'scale(1.05)' : 'scale(1)'
              }}
            >
              すべて
            </button>
            
            {/* 人気タグを表示 */}
            {popularTags.map((tag) => (
              <button
                key={tag}
                ref={config.tag === tag ? selectedTagRef : null}
                onClick={() => handleTagSelect(tag)}
                style={{
                  padding: config.tag === tag ? '8px 16px' : '6px 12px',
                  fontSize: config.tag === tag ? '14px' : '13px',
                  fontWeight: '600',
                  border: '1px solid',
                  borderColor: config.tag === tag ? 'var(--primary-color)' : 'var(--border-color)',
                  background: config.tag === tag ? 'var(--primary-color)' : 'var(--surface-color)',
                  color: config.tag === tag ? 'var(--button-text-active)' : 'var(--text-primary)',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transform: config.tag === tag ? 'scale(1.05)' : 'scale(1)'
                }}
              >
                {tag}
              </button>
            ))}
          </div>
          <style jsx>{`
            div::-webkit-scrollbar {
              display: none;
            }
          `}</style>
        </div>
      ) : (
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
              borderColor: !config.tag ? 'var(--primary-color)' : 'var(--border-color)',
              background: !config.tag ? 'var(--primary-color)' : 'var(--surface-color)',
              color: !config.tag ? 'white' : 'var(--text-primary)',
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
                borderColor: config.tag === tag ? 'var(--primary-color)' : 'var(--border-color)',
                background: config.tag === tag ? 'var(--primary-color)' : 'var(--surface-color)',
                color: config.tag === tag ? 'white' : 'var(--text-primary)',
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
      )}
    </div>
  )
}