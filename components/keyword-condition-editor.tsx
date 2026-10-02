'use client'

import { Plus, X } from 'lucide-react'
import { useId, useState } from 'react'
import { TagAutocompleteInput } from '@/components/tag-autocomplete-input'
import {
  KEYWORD_GROUPS,
  KEYWORD_GROUP_LABELS,
  addKeyword,
  normalizeKeyword,
  removeKeyword,
  type KeywordConditions,
  type KeywordDescription,
  type KeywordDrafts,
  type KeywordGroup,
} from '@/lib/search/keyword-conditions'
import styles from './keyword-condition-editor.module.css'

interface KeywordConditionEditorProps {
  conditions: KeywordConditions
  drafts: KeywordDrafts
  targets: 'keyword' | 'tag'
  description: KeywordDescription
  onConditionsChange: (next: KeywordConditions) => void
  onDraftChange: (group: KeywordGroup, value: string) => void
  /** 打ちかけの語が無い欄で Enter を押したとき */
  onSubmit: () => void
  /** クリア（元に戻す）と検索ボタン */
  actions: React.ReactNode
  /** 通常入力から切り替えた直後だけ、検索欄から広がる動きを付ける */
  animateIn?: boolean
}

/**
 * 検索欄の代わりに出す条件入力。3 つの欄はいつも表示し、各欄でタグ候補を使える。
 * 候補を選ぶと語として加えるだけで、検索はしない（キーワード検索のままタグ検索に変えない）
 */
export function KeywordConditionEditor({
  conditions,
  drafts,
  targets,
  description,
  onConditionsChange,
  onDraftChange,
  onSubmit,
  actions,
  animateIn = false,
}: KeywordConditionEditorProps) {
  const baseId = useId()
  // 既にある語を加えようとしたら、その語を一瞬強調する（count で同じ語でもアニメーションをやり直す）
  const [flash, setFlash] = useState<{ word: string; count: number } | null>(
    null,
  )
  const inputId = (group: KeywordGroup) => `${baseId}-${group}`

  const commit = (group: KeywordGroup, raw: string) => {
    const result = addKeyword(conditions, group, raw)
    onDraftChange(group, '')
    if (result.duplicateIn) {
      setFlash((prev) => ({
        word: normalizeKeyword(raw),
        count: (prev?.count ?? 0) + 1,
      }))
      return
    }
    if (result.conditions !== conditions) onConditionsChange(result.conditions)
  }

  const noun = targets === 'tag' ? 'タグ' : '語'

  return (
    <div
      className={`${styles.editor}${animateIn ? ` ${styles.animateIn}` : ''}`}
    >
      {KEYWORD_GROUPS.map((group) => {
        const words = conditions[group]
        return (
          <div key={group} className={styles.lane}>
            <label className={styles.label} htmlFor={inputId(group)}>
              {KEYWORD_GROUP_LABELS[group]}
            </label>
            <div
              className={styles.body}
              onMouseDown={(event) => {
                // 欄の余白を押しても入力できるようにする（語の削除ボタンなどは除く）
                if (event.target !== event.currentTarget) return
                event.preventDefault()
                document.getElementById(inputId(group))?.focus()
              }}
            >
              {words.map((word) => (
                <span
                  key={flash?.word === word ? `${word}-${flash.count}` : word}
                  className={`${styles.chip}${flash?.word === word ? ` ${styles.flash}` : ''}`}
                >
                  <span className={styles.word}>{word}</span>
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`${word}を削除`}
                    onClick={() => {
                      onConditionsChange(removeKeyword(conditions, group, word))
                      document.getElementById(inputId(group))?.focus()
                    }}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              ))}
              <span className={styles.add}>
                <Plus size={14} aria-hidden="true" className={styles.addIcon} />
                <TagAutocompleteInput
                  id={inputId(group)}
                  wrapperClassName={styles.addField}
                  className={styles.input}
                  value={drafts[group]}
                  onChange={(value) => onDraftChange(group, value)}
                  onPick={(tag) => commit(group, tag)}
                  onKeyPress={() => {
                    if (drafts[group].trim()) commit(group, drafts[group])
                    else onSubmit()
                  }}
                  placeholder={words.length > 0 ? '追加' : `${noun}を追加`}
                  ariaLabel={`${KEYWORD_GROUP_LABELS[group]}${noun}を追加`}
                />
              </span>
            </div>
          </div>
        )
      })}
      <div className={styles.foot}>
        <p
          className={`${styles.description}${description.warning ? ` ${styles.warning}` : ''}`}
          aria-live="polite"
        >
          {description.text}
        </p>
        <div className={styles.actions}>{actions}</div>
      </div>
    </div>
  )
}
