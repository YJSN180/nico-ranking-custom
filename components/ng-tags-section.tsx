'use client'

import { useState } from 'react'
import type { ExtendedNGList } from '../types/ng-list-extended'
import { TagIcon, getTagTypeLabel } from './tag-icon'
import { TagAutocompleteInput } from './tag-autocomplete-input'
import styles from './settings-modal.module.css'

interface NGTagsSectionProps {
  tags: ExtendedNGList['tags']
  onUpdate: (tags: ExtendedNGList['tags']) => void
}

type TagType = 'locked' | 'user' | 'both'
type MatchType = 'exact' | 'partial'

export function NGTagsSection({ tags, onUpdate }: NGTagsSectionProps) {
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
    </section>
  )
}