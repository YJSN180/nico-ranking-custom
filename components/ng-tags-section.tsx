'use client'

import { useState } from 'react'
import type { ExtendedNGList } from '../types/ng-list-extended'
import { TagIcon, getTagTypeLabel } from './tag-icon'
import { TagAutocompleteInput } from './tag-autocomplete-input'
import styles from './settings-modal.module.css'

interface NGTagsSectionProps {
  tags: ExtendedNGList['tags']
  onUpdate: (tags: ExtendedNGList['tags']) => void
  // 一括追加機能用のprops
  bulkTags?: string
  onBulkTagsChange?: (value: string) => void
  showBulkTags?: boolean
  onShowBulkTagsToggle?: () => void
  bulkTagType?: 'locked' | 'user' | 'both'
  onBulkTagTypeChange?: (type: 'locked' | 'user' | 'both') => void
  bulkTagMatchType?: 'exact' | 'partial'
  onBulkTagMatchTypeChange?: (type: 'exact' | 'partial') => void
  onBulkAddTags?: () => void
}

type TagType = 'locked' | 'user' | 'both'
type MatchType = 'exact' | 'partial'

export function NGTagsSection({
  tags,
  onUpdate,
  bulkTags = '',
  onBulkTagsChange,
  showBulkTags = false,
  onShowBulkTagsToggle,
  bulkTagType = 'both',
  onBulkTagTypeChange,
  bulkTagMatchType = 'partial',
  onBulkTagMatchTypeChange,
  onBulkAddTags
}: NGTagsSectionProps) {
  const [inputTag, setInputTag] = useState('')
  const [tagType, setTagType] = useState<TagType>('both')
  const [matchType, setMatchType] = useState<MatchType>('partial')

  if (!tags) {
    return null
  }

  const handleAddTag = () => {
    const trimmedTag = inputTag.trim()
    if (!trimmedTag) return

    // 既存のタグをコピー
    const newTags = {
      locked: {
        exact: [...tags.locked.exact],
        partial: [...tags.locked.partial]
      },
      user: {
        exact: [...tags.user.exact],
        partial: [...tags.user.partial]
      },
      both: {
        exact: [...tags.both.exact],
        partial: [...tags.both.partial]
      }
    }

    // 新しいタグを追加
    newTags[tagType][matchType].push(trimmedTag)

    onUpdate(newTags)
    setInputTag('')
  }

  const handleRemoveTag = (type: TagType, matchType: MatchType, index: number) => {
    const newTags = {
      ...tags,
      [type]: {
        ...tags[type],
        [matchType]: tags[type][matchType].filter((_, i) => i !== index)
      }
    }

    onUpdate(newTags)
  }

  const renderTagList = () => {
    const allTags: Array<{
      name: string
      type: TagType
      matchType: MatchType
      displayType: string
      icon: string
    }> = []

    // ロックタグ
    tags.locked.exact.forEach((tag, index) => {
      allTags.push({
        name: tag,
        type: 'locked',
        matchType: 'exact',
        displayType: 'ロック・完全',
        icon: '🔒'
      })
    })
    tags.locked.partial.forEach((tag, index) => {
      allTags.push({
        name: tag,
        type: 'locked',
        matchType: 'partial',
        displayType: 'ロック・部分',
        icon: '🔒'
      })
    })

    // ユーザータグ
    tags.user.exact.forEach((tag, index) => {
      allTags.push({
        name: tag,
        type: 'user',
        matchType: 'exact',
        displayType: 'ユーザー・完全',
        icon: '🔖'
      })
    })
    tags.user.partial.forEach((tag, index) => {
      allTags.push({
        name: tag,
        type: 'user',
        matchType: 'partial',
        displayType: 'ユーザー・部分',
        icon: '🔖'
      })
    })

    // 両方タグ
    tags.both.exact.forEach((tag, index) => {
      allTags.push({
        name: tag,
        type: 'both',
        matchType: 'exact',
        displayType: '両方・完全',
        icon: '🏷️'
      })
    })
    tags.both.partial.forEach((tag, index) => {
      allTags.push({
        name: tag,
        type: 'both',
        matchType: 'partial',
        displayType: '両方・部分',
        icon: '🏷️'
      })
    })

    return allTags.map((tagInfo, index) => {
      // 各カテゴリ内でのインデックスを計算
      let categoryIndex = 0
      if (tagInfo.type === 'locked') {
        if (tagInfo.matchType === 'exact') {
          categoryIndex = tags.locked.exact.indexOf(tagInfo.name)
        } else {
          categoryIndex = tags.locked.partial.indexOf(tagInfo.name)
        }
      } else if (tagInfo.type === 'user') {
        if (tagInfo.matchType === 'exact') {
          categoryIndex = tags.user.exact.indexOf(tagInfo.name)
        } else {
          categoryIndex = tags.user.partial.indexOf(tagInfo.name)
        }
      } else {
        if (tagInfo.matchType === 'exact') {
          categoryIndex = tags.both.exact.indexOf(tagInfo.name)
        } else {
          categoryIndex = tags.both.partial.indexOf(tagInfo.name)
        }
      }

      return (
        <div key={`${tagInfo.type}-${tagInfo.matchType}-${categoryIndex}`} className={styles.listItem}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TagIcon type={tagInfo.type} size={14} />
            <span>{tagInfo.name} ({tagInfo.displayType})</span>
          </span>
          <button 
            onClick={() => handleRemoveTag(tagInfo.type, tagInfo.matchType, categoryIndex)}
          >
            ×
          </button>
        </div>
      )
    })
  }

  return (
    <section className={styles.section}>
      <h3>🚫 タグ</h3>
      
      {/* タグタイプ選択 */}
      <div className={styles.radioGroup}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="radio"
            value="locked"
            checked={tagType === 'locked'}
            onChange={(e) => setTagType(e.target.value as TagType)}
          />
          <TagIcon type="locked" size={14} />
          <span>ロックタグ</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="radio"
            value="user"
            checked={tagType === 'user'}
            onChange={(e) => setTagType(e.target.value as TagType)}
          />
          <TagIcon type="user" size={14} />
          <span>ユーザータグ</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="radio"
            value="both"
            checked={tagType === 'both'}
            onChange={(e) => setTagType(e.target.value as TagType)}
          />
          <TagIcon type="both" size={14} />
          <span>両方</span>
        </label>
      </div>

      {/* マッチング方式選択 */}
      <div className={styles.radioGroup}>
        <label>
          <input
            type="radio"
            value="exact"
            checked={matchType === 'exact'}
            onChange={(e) => setMatchType(e.target.value as MatchType)}
          />
          完全一致
        </label>
        <label>
          <input
            type="radio"
            value="partial"
            checked={matchType === 'partial'}
            onChange={(e) => setMatchType(e.target.value as MatchType)}
          />
          部分一致
        </label>
      </div>

      {/* タグリスト */}
      <div className={styles.list}>
        {renderTagList()}
      </div>

      {/* タグ追加入力 */}
      <div className={styles.inputRow}>
        <TagAutocompleteInput
          value={inputTag}
          onChange={setInputTag}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddTag()
            }
          }}
          placeholder="タグ名を入力"
          style={{ flex: 1 }}
        />
        <button onClick={handleAddTag}>追加</button>
      </div>

      {/* タグ一括追加セクション */}
      {onShowBulkTagsToggle && (
        <div style={{ marginTop: '12px' }}>
          <button
            onClick={onShowBulkTagsToggle}
            style={{
              background: 'var(--primary-color)',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {showBulkTags ? '▼' : '▶'} 複数タグを一括追加
          </button>

          {showBulkTags && (
            <div style={{ marginTop: '12px' }}>
              {/* タグタイプ選択 */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  タグの種類:
                </label>
                <select
                  value={bulkTagType}
                  onChange={(e) => onBulkTagTypeChange?.(e.target.value as 'locked' | 'user' | 'both')}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    fontSize: '14px',
                    background: 'var(--background-color)',
                    color: 'var(--text-color)',
                    cursor: 'pointer'
                  }}
                >
                  <option value="locked">🔒 ロックタグ</option>
                  <option value="user">🔖 ユーザータグ</option>
                  <option value="both">🏷️ 両方（ロック・ユーザー問わず）</option>
                </select>
              </div>

              {/* マッチタイプ選択 */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  マッチ方法:
                </label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="exact"
                      checked={bulkTagMatchType === 'exact'}
                      onChange={(e) => onBulkTagMatchTypeChange?.(e.target.value as 'exact' | 'partial')}
                      style={{ marginRight: '6px' }}
                    />
                    <span style={{ fontSize: '14px' }}>完全一致</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="partial"
                      checked={bulkTagMatchType === 'partial'}
                      onChange={(e) => onBulkTagMatchTypeChange?.(e.target.value as 'exact' | 'partial')}
                      style={{ marginRight: '6px' }}
                    />
                    <span style={{ fontSize: '14px' }}>部分一致</span>
                  </label>
                </div>
              </div>

              {/* 選択状態の説明 */}
              <div style={{
                padding: '8px 12px',
                background: 'var(--background-secondary)',
                borderRadius: '4px',
                marginBottom: '12px',
                fontSize: '13px',
                color: 'var(--text-secondary)'
              }}>
                現在の設定:
                <strong style={{ color: 'var(--text-color)' }}>
                  {bulkTagType === 'locked' ? 'ロックタグ' : bulkTagType === 'user' ? 'ユーザータグ' : '両方'}
                </strong>
                の
                <strong style={{ color: 'var(--text-color)' }}>
                  {bulkTagMatchType === 'exact' ? '完全一致' : '部分一致'}
                </strong>
                に追加されます
              </div>

              {/* タグ入力エリア */}
              <textarea
                value={bulkTags}
                onChange={(e) => onBulkTagsChange?.(e.target.value)}
                placeholder={`タグを改行区切りで入力\n例:\nゲーム実況\nVOCALOID\n東方\nアニメ`}
                style={{
                  width: '100%',
                  height: '120px',
                  padding: '8px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
              <button
                onClick={onBulkAddTags}
                style={{
                  marginTop: '8px',
                  padding: '8px 16px',
                  background: 'var(--primary-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                一括追加
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}