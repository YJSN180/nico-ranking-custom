'use client'

import { useState, useRef, useCallback, useMemo } from 'react'

interface TagAutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  onKeyPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  style?: React.CSSProperties
  disabled?: boolean
  className?: string
}

export function TagAutocompleteInput({
  value,
  onChange,
  onKeyPress,
  placeholder,
  style,
  disabled = false,
  className
}: TagAutocompleteInputProps) {
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // オートコンプリート用のAPIエンドポイント
  const getAutocompleteEndpoint = () => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      if (hostname === 'nico-rank.com') {
        return 'https://nico-rank.com/api/tags/autocomplete'
      } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return '/api/tags/autocomplete'
      } else if (hostname.includes('vercel.app')) {
        return '/api/tags/autocomplete'
      }
    }
    return '/api/tags/autocomplete'
  }

  // タグのオートコンプリート候補を取得
  const fetchTagSuggestions = useCallback(async (query: string): Promise<string[]> => {
    if (!query || query.trim().length < 2) {
      return []
    }

    try {
      setIsLoadingSuggestions(true)
      const endpoint = getAutocompleteEndpoint()
      const url = new URL(endpoint, window.location.origin)
      url.searchParams.set('q', query.trim())
      url.searchParams.set('limit', '10')

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        console.warn('Failed to fetch tag suggestions:', response.status)
        return []
      }

      const data = await response.json()
      return data.suggestions || []
    } catch (error) {
      console.error('Error fetching tag suggestions:', error)
      return []
    } finally {
      setIsLoadingSuggestions(false)
    }
  }, [])

  // デバウンス処理をuseMemoとuseCallbackで実装
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  
  const updateSuggestions = useCallback(async (query: string) => {
    if (query.trim().length >= 2) {
      const suggestions = await fetchTagSuggestions(query)
      setTagSuggestions(suggestions)
      setShowSuggestions(suggestions.length > 0)
      setSelectedSuggestionIndex(-1)
    } else {
      setTagSuggestions([])
      setShowSuggestions(false)
      setSelectedSuggestionIndex(-1)
    }
  }, [fetchTagSuggestions])

  const handleInputChange = useCallback((newValue: string) => {
    onChange(newValue)
    
    // デバウンス処理
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    debounceRef.current = setTimeout(() => {
      updateSuggestions(newValue)
    }, 300)
  }, [onChange, updateSuggestions])

  // 外部クリック処理をonBlurで実装
  const handleBlur = useCallback((e: React.FocusEvent) => {
    // 入力フィールドからフォーカスが外れたとき
    // すぐに閉じると候補をクリックできないので、少し遅延
    setTimeout(() => {
      if (!wrapperRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
      }
    }, 200)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (showSuggestions && selectedSuggestionIndex >= 0 && selectedSuggestionIndex < tagSuggestions.length) {
        // 選択された候補を使用
        onChange(tagSuggestions[selectedSuggestionIndex])
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
      } else {
        // 通常のキー処理をonKeyPressに委任
        if (onKeyPress) {
          onKeyPress(e)
        }
      }
    } else if (e.key === 'Escape') {
      // オートコンプリートを閉じる
      setShowSuggestions(false)
      setSelectedSuggestionIndex(-1)
    } else if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault()
      setSelectedSuggestionIndex(prev => 
        prev < tagSuggestions.length - 1 ? prev + 1 : 0
      )
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault()
      setSelectedSuggestionIndex(prev => 
        prev > 0 ? prev - 1 : tagSuggestions.length - 1
      )
    }
  }

  const selectSuggestion = (suggestion: string) => {
    onChange(suggestion)
    setShowSuggestions(false)
    setSelectedSuggestionIndex(-1)
    inputRef.current?.focus()
  }
  
  // コンポーネントアンマウント時のクリーンアップ
  const cleanupDebounce = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div ref={wrapperRef} style={{ position: 'relative', ...style }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        style={{ 
          width: '100%',
          ...style
        }}
      />
      
      {showSuggestions && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#ffffff',
            border: '1px solid #d1d5db',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 10,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
        >
          {isLoadingSuggestions ? (
            <div
              style={{
                padding: '12px',
                textAlign: 'center',
                fontSize: '13px',
                color: '#667eea',
                fontStyle: 'italic'
              }}
            >
              検索中...
            </div>
          ) : tagSuggestions.length > 0 ? (
            tagSuggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => selectSuggestion(suggestion)}
                onMouseEnter={() => setSelectedSuggestionIndex(index)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 12px',
                  background: index === selectedSuggestionIndex ? '#667eea' : 'none',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: index === selectedSuggestionIndex ? 'white' : '#333333',
                  transition: 'background-color 0.2s'
                }}
              >
                {suggestion}
              </button>
            ))
          ) : (
            <div
              style={{
                padding: '12px',
                textAlign: 'center',
                fontSize: '13px',
                color: '#6b7280',
                fontStyle: 'italic'
              }}
            >
              候補が見つかりませんでした
            </div>
          )}
        </div>
      )}
    </div>
  )
}