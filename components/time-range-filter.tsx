'use client'

import React, { useState, useRef, useEffect } from 'react'
import styles from './time-range-filter.module.css'

export type TimeRangeValue = '24h' | '1w' | '1m' | '6m' | '1y' | 'all'

interface TimeRangeOption {
  value: TimeRangeValue
  label: string
}

interface TimeRangeFilterProps {
  value: TimeRangeValue
  onChange: (value: TimeRangeValue) => void
  totalCount?: number
  filteredCount?: number
  disabled?: boolean
}

const timeRangeOptions: TimeRangeOption[] = [
  { value: 'all', label: 'すべて表示' },
  { value: '24h', label: '過去24時間' },
  { value: '1w', label: '過去1週間' },
  { value: '1m', label: '過去1ヶ月' },
  { value: '6m', label: '過去6ヶ月' },
  { value: '1y', label: '過去1年' }
]

export function TimeRangeFilter({
  value,
  onChange,
  totalCount,
  filteredCount,
  disabled = false
}: TimeRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // 現在選択されているオプション
  const currentOption = timeRangeOptions.find(opt => opt.value === value) || timeRangeOptions[0]
  
  // ドロップダウンの開閉
  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen)
    }
  }
  
  // オプション選択
  const handleSelect = (optionValue: TimeRangeValue) => {
    onChange(optionValue)
    setIsOpen(false)
  }
  
  // 外部クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])
  
  // キーボードナビゲーション
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleDropdown()
    } else if (e.key === 'Escape' && isOpen) {
      setIsOpen(false)
    }
  }
  
  // フィルタリング状態の表示
  const isFiltered = value !== 'all'
  
  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        className={`${styles.button} ${isFiltered ? styles.active : ''} ${disabled ? styles.disabled : ''}`}
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`時間範囲フィルター: ${currentOption.label}`}
        disabled={disabled}
        type="button"
      >
        <span className={styles.icon}>⏰</span>
        <span className={styles.label}>
          {currentOption.label}
        </span>
        <span className={styles.arrow}>▼</span>
      </button>
      
      {isOpen && (
        <div className={styles.dropdown} role="listbox">
          {timeRangeOptions.map(option => (
            <button
              key={option.value}
              className={`${styles.option} ${option.value === value ? styles.selected : ''}`}
              onClick={() => handleSelect(option.value)}
              role="option"
              aria-selected={option.value === value}
              type="button"
            >
              {option.value === value && <span className={styles.check}>✓</span>}
              <span className={styles.optionLabel}>
                {option.label}
              </span>
            </button>
          ))}
        </div>
      )}
      
      {/* フィルター状態インジケーター */}
      {totalCount !== undefined && filteredCount !== undefined && isFiltered && (
        <div className={styles.indicator}>
          {totalCount}件中 {filteredCount}件を表示
        </div>
      )}
    </div>
  )
}

// フィルタリング関数
export function filterByTimeRange<T extends { registeredAt?: string }>(
  items: T[],
  range: TimeRangeValue
): T[] {
  if (range === 'all') return items
  
  const now = new Date()
  const cutoffDate = new Date()
  
  switch(range) {
    case '24h':
      cutoffDate.setHours(now.getHours() - 24)
      break
    case '1w':
      cutoffDate.setDate(now.getDate() - 7)
      break
    case '1m':
      cutoffDate.setMonth(now.getMonth() - 1)
      break
    case '6m':
      cutoffDate.setMonth(now.getMonth() - 6)
      break
    case '1y':
      cutoffDate.setFullYear(now.getFullYear() - 1)
      break
    default:
      return items
  }
  
  return items.filter(item => {
    // registeredAtがない場合は表示（フィルタリングしない）
    if (!item.registeredAt) return true
    
    try {
      const itemDate = new Date(item.registeredAt)
      return itemDate >= cutoffDate
    } catch {
      // 日付パースエラーの場合は表示
      return true
    }
  })
}