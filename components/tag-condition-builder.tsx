/**
 * タグ条件ビルダーコンポーネント
 */

import React, { useCallback } from 'react'
import { TagInput } from './tag-input'
import type { CustomTagConditions, TagOperator } from '@/types/custom-tag-ranking'
import type { TagSuggestion } from '@/types/custom-tag-ranking'
import styles from './tag-condition-builder.module.css'

interface TagConditionBuilderProps {
  conditions: CustomTagConditions
  onChange: (conditions: CustomTagConditions) => void
  suggestions: TagSuggestion[]
  getSuggestions: (input: string) => TagSuggestion[]
  disabled?: boolean
}

export function TagConditionBuilder({
  conditions,
  onChange,
  suggestions,
  getSuggestions,
  disabled = false
}: TagConditionBuilderProps) {
  // タグ追加
  const handleAddTag = useCallback((operator: TagOperator, tag: string) => {
    const newConditions = { ...conditions }
    
    // 既に同じタグが存在する場合は追加しない
    if (newConditions[operator].includes(tag)) {
      return
    }
    
    // 他の条件から削除（同じタグが複数の条件に存在しないようにする）
    if (operator !== 'and') newConditions.and = newConditions.and.filter(t => t !== tag)
    if (operator !== 'or') newConditions.or = newConditions.or.filter(t => t !== tag)
    if (operator !== 'not') newConditions.not = newConditions.not.filter(t => t !== tag)
    
    // 追加
    newConditions[operator] = [...newConditions[operator], tag]
    onChange(newConditions)
  }, [conditions, onChange])

  // タグ削除
  const handleRemoveTag = useCallback((operator: TagOperator, tag: string) => {
    const newConditions = { ...conditions }
    newConditions[operator] = newConditions[operator].filter(t => t !== tag)
    onChange(newConditions)
  }, [conditions, onChange])

  // 条件クリア
  const handleClearCondition = useCallback((operator: TagOperator) => {
    const newConditions = { ...conditions }
    newConditions[operator] = []
    onChange(newConditions)
  }, [conditions, onChange])

  const renderConditionRow = (
    operator: TagOperator,
    label: string,
    description: string,
    color: string
  ) => (
    <div className={styles.conditionRow}>
      <div className={styles.conditionHeader}>
        <div className={styles.conditionLabel} style={{ color }}>
          {label}
        </div>
        <div className={styles.conditionDescription}>
          {description}
        </div>
      </div>
      
      <div className={styles.conditionContent}>
        <div className={styles.tagList}>
          {conditions[operator].map(tag => (
            <div 
              key={tag} 
              className={styles.tag}
              style={{ borderColor: color }}
            >
              <span className={styles.tagName}>{tag}</span>
              <button
                type="button"
                onClick={() => handleRemoveTag(operator, tag)}
                className={styles.tagRemove}
                disabled={disabled}
                title="タグを削除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        
        <div className={styles.inputSection}>
          <TagInput
            placeholder={`${label}条件のタグを入力...`}
            onAdd={(tag) => handleAddTag(operator, tag)}
            suggestions={suggestions}
            getSuggestions={getSuggestions}
            disabled={disabled}
          />
          {conditions[operator].length > 0 && (
            <button
              type="button"
              onClick={() => handleClearCondition(operator)}
              className={styles.clearButton}
              disabled={disabled}
            >
              クリア
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className={styles.container}>
      {renderConditionRow(
        'and',
        'AND',
        'すべてのタグを含む動画',
        'var(--success-color)'
      )}
      
      {renderConditionRow(
        'or',
        'OR',
        'いずれかのタグを含む動画',
        'var(--info-color)'
      )}
      
      {renderConditionRow(
        'not',
        'NOT',
        'これらのタグを含まない動画',
        'var(--error-color)'
      )}
      
      {/* 現在の条件のサマリー */}
      {(conditions.and.length > 0 || conditions.or.length > 0 || conditions.not.length > 0) && (
        <div className={styles.summary}>
          <div className={styles.summaryTitle}>現在の条件:</div>
          <div className={styles.summaryContent}>
            {conditions.and.length > 0 && (
              <span className={styles.summaryItem}>
                すべて含む: {conditions.and.join(', ')}
              </span>
            )}
            {conditions.or.length > 0 && (
              <span className={styles.summaryItem}>
                いずれか含む: {conditions.or.join(', ')}
              </span>
            )}
            {conditions.not.length > 0 && (
              <span className={styles.summaryItem}>
                含まない: {conditions.not.join(', ')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}