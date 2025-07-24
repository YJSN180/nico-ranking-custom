/**
 * タグ入力コンポーネント（オートコンプリート付き）
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { TagSuggestion } from '@/types/custom-tag-ranking'
import styles from './tag-input.module.css'

interface TagInputProps {
  placeholder?: string
  onAdd: (tag: string) => void
  suggestions: TagSuggestion[]
  getSuggestions: (input: string) => TagSuggestion[]
  disabled?: boolean
}

export function TagInput({
  placeholder = 'タグを入力...',
  onAdd,
  suggestions,
  getSuggestions,
  disabled = false
}: TagInputProps) {
  const [value, setValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [filteredSuggestions, setFilteredSuggestions] = useState<TagSuggestion[]>([])
  
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout>()

  // 入力値変更時の処理
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setValue(newValue)
    setSelectedIndex(-1)
    
    // デバウンス処理
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    
    debounceTimerRef.current = setTimeout(() => {
      if (newValue.trim()) {
        const filtered = getSuggestions(newValue)
        setFilteredSuggestions(filtered)
        setShowSuggestions(filtered.length > 0)
      } else {
        setShowSuggestions(false)
      }
    }, 300)
  }, [getSuggestions])

  // タグ追加処理
  const handleAddTag = useCallback((tag: string) => {
    const trimmedTag = tag.trim()
    if (trimmedTag) {
      onAdd(trimmedTag)
      setValue('')
      setShowSuggestions(false)
      setSelectedIndex(-1)
      inputRef.current?.focus()
    }
  }, [onAdd])

  // キーボード操作
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) {
      if (e.key === 'Enter' && value.trim()) {
        e.preventDefault()
        handleAddTag(value)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => 
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        )
        break
        
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1)
        break
        
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < filteredSuggestions.length) {
          handleAddTag(filteredSuggestions[selectedIndex].name)
        } else if (value.trim()) {
          handleAddTag(value)
        }
        break
        
      case 'Escape':
        setShowSuggestions(false)
        setSelectedIndex(-1)
        break
    }
  }, [showSuggestions, value, selectedIndex, filteredSuggestions, handleAddTag])

  // 候補選択
  const handleSuggestionClick = useCallback((suggestion: TagSuggestion) => {
    handleAddTag(suggestion.name)
  }, [handleAddTag])

  // フォーカス処理
  const handleFocus = useCallback(() => {
    if (value.trim()) {
      const filtered = getSuggestions(value)
      setFilteredSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    }
  }, [value, getSuggestions])

  // 外部クリックで候補を閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  return (
    <div className={styles.container}>
      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className={styles.input}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => handleAddTag(value)}
          disabled={disabled || !value.trim()}
          className={styles.addButton}
          title="タグを追加"
        >
          +
        </button>
      </div>
      
      {showSuggestions && (
        <div ref={suggestionsRef} className={styles.suggestions}>
          {filteredSuggestions.map((suggestion, index) => (
            <div
              key={suggestion.name}
              className={`${styles.suggestionItem} ${
                index === selectedIndex ? styles.selected : ''
              }`}
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className={styles.suggestionName}>
                {suggestion.name}
              </span>
              <span className={styles.suggestionMeta}>
                {suggestion.isPopular && (
                  <span className={styles.popularBadge}>人気</span>
                )}
                <span className={styles.count}>
                  {suggestion.count}件
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}