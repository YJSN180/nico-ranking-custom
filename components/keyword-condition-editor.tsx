'use client'

import { Plus, X } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { TagAutocompleteInput } from '@/components/tag-autocomplete-input'
import {
  KEYWORD_GROUPS,
  KEYWORD_GROUP_LABELS,
  addKeyword,
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
  /** 打ちかけの語が無い欄で Enter を押したとき（無ければ何もしない） */
  onSubmit?: () => void
  /** 説明の横に置く操作（検索ではクリアと検索ボタン） */
  actions?: React.ReactNode
  /** 通常入力から切り替えた直後だけ、検索欄から広がる動きを付ける */
  animateIn?: boolean
  /** 欄に加える語の整え方（既定は検索式向け。カスタムランキングはタグ名をそのまま残す） */
  normalizeWord?: (raw: string) => string
  /** 語のチップの中、削除ボタンの前に置く操作（カスタムランキングのタグ種別） */
  renderWordControl?: (group: KeywordGroup, word: string) => React.ReactNode
  /** 「すべて含む」と「いずれかを含む」の両方に語があるとき、間に示す組み合わせ方（カスタムランキングの「または」） */
  groupJoin?: string
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
  normalizeWord,
  renderWordControl,
  groupJoin,
}: KeywordConditionEditorProps) {
  const baseId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  // 既にある語を加えようとしたら、その語を一瞬強調する（count で同じ語でもアニメーションをやり直す）
  const [flash, setFlash] = useState<{ word: string; count: number } | null>(
    null,
  )
  // 強調だけでは読み上げで伝わらないので、同じ語がどの欄にあるかを知らせる
  const [notice, setNotice] = useState('')
  const inputId = (group: KeywordGroup) => `${baseId}-${group}`

  // 強調した語が欄のスクロールの外（モーダルの下など）にあっても見えるところへ寄せる
  useEffect(() => {
    if (!flash) return
    const chip = rootRef.current?.querySelector<HTMLElement>('[data-flash]')
    if (typeof chip?.scrollIntoView === 'function') {
      chip.scrollIntoView({ block: 'nearest' })
    }
  }, [flash])

  const commit = (group: KeywordGroup, raw: string) => {
    const result = addKeyword(conditions, group, raw, normalizeWord)
    onDraftChange(group, '')
    if (result.duplicate) {
      const { word, group: existingGroup } = result.duplicate
      setFlash((prev) => ({ word, count: (prev?.count ?? 0) + 1 }))
      setNotice(
        `「${word}」はすでに「${KEYWORD_GROUP_LABELS[existingGroup]}」にあります。`,
      )
      return
    }
    setNotice('')
    if (result.conditions !== conditions) onConditionsChange(result.conditions)
  }

  const noun = targets === 'tag' ? 'タグ' : '語'
  // 打ちかけの語も含めて、2 つの欄の両方に語があるか（説明文と同じく、確定前の語も数える）
  const filled = (group: KeywordGroup): boolean =>
    conditions[group].length > 0 || drafts[group].trim() !== ''

  return (
    <div
      ref={rootRef}
      className={`${styles.editor}${animateIn ? ` ${styles.animateIn}` : ''}`}
    >
      {KEYWORD_GROUPS.map((group) => {
        const words = conditions[group]
        const joined =
          groupJoin !== undefined &&
          group === 'any' &&
          filled('any') &&
          filled('all')
        return (
          <Fragment key={group}>
            {joined && <div className={styles.join}>{groupJoin}</div>}
            <div className={styles.lane}>
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
                    data-flash={flash?.word === word ? '' : undefined}
                    className={`${styles.chip}${flash?.word === word ? ` ${styles.flash}` : ''}`}
                  >
                    <span className={styles.word}>{word}</span>
                    {renderWordControl?.(group, word)}
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`${word}を削除`}
                      onClick={() => {
                        onConditionsChange(
                          removeKeyword(conditions, group, word),
                        )
                        document.getElementById(inputId(group))?.focus()
                      }}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                <span className={styles.add}>
                  <Plus
                    size={14}
                    aria-hidden="true"
                    className={styles.addIcon}
                  />
                  <TagAutocompleteInput
                    id={inputId(group)}
                    wrapperClassName={styles.addField}
                    className={styles.input}
                    value={drafts[group]}
                    onChange={(value) => onDraftChange(group, value)}
                    onPick={(tag) => commit(group, tag)}
                    onKeyPress={() => {
                      if (drafts[group].trim()) commit(group, drafts[group])
                      else onSubmit?.()
                    }}
                    placeholder={words.length > 0 ? '追加' : `${noun}を追加`}
                    ariaLabel={`${KEYWORD_GROUP_LABELS[group]}${noun}を追加`}
                  />
                </span>
              </div>
            </div>
          </Fragment>
        )
      })}
      <div className={styles.foot}>
        <p
          className={`${styles.description}${description.warning ? ` ${styles.warning}` : ''}`}
          aria-live="polite"
        >
          {description.text}
        </p>
        <span className={styles.srOnly} role="status">
          {notice}
        </span>
        {actions !== undefined && (
          <div className={styles.actions}>{actions}</div>
        )}
      </div>
    </div>
  )
}
