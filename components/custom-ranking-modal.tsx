'use client'

import { useState, useEffect, useRef } from 'react'
import { GENRE_LABELS, type RankingGenre } from '@/types/ranking-config'
import type { CustomRankingFormState, ModalStep, TagCondition, TagOperator } from '@/types/custom-ranking'
import styles from './custom-ranking-modal.module.css'

interface CustomRankingModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: CustomRankingFormState) => void
  existingTitles?: string[]
}

export function CustomRankingModal({ 
  isOpen, 
  onClose, 
  onSave, 
  existingTitles = [] 
}: CustomRankingModalProps) {
  const [currentStep, setCurrentStep] = useState<ModalStep>(1)
  const [formData, setFormData] = useState<CustomRankingFormState>({
    baseGenre: undefined,
    conditions: [],
    title: ''
  })
  
  // タグ入力関連の状態
  const [tagInput, setTagInput] = useState('')
  const [tagOperator, setTagOperator] = useState<TagOperator>('AND')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  const modalRef = useRef<HTMLDivElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // モーダルが開いた時にリセット
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1)
      setFormData({
        baseGenre: undefined,
        conditions: [],
        title: ''
      })
      setTagInput('')
      setTagOperator('AND')
    }
  }, [isOpen])

  // ESCキーで閉じる
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // ベースジャンル選択（Step 1）
  const handleGenreSelect = (genre: RankingGenre) => {
    if (genre === 'custom') return // カスタムは選択不可
    setFormData(prev => ({ ...prev, baseGenre: genre }))
  }

  // タグ追加（Step 2）
  const handleAddTag = () => {
    const tag = tagInput.trim()
    if (!tag) return

    // 既存のタグと重複チェック
    const exists = formData.conditions.some(c => c.tag.toLowerCase() === tag.toLowerCase())
    if (exists) return

    const newCondition: TagCondition = {
      tag,
      operator: tagOperator
    }

    setFormData(prev => ({
      ...prev,
      conditions: [...prev.conditions, newCondition]
    }))

    setTagInput('')
    setShowSuggestions(false)
  }

  // タグ削除
  const handleRemoveTag = (index: number) => {
    setFormData(prev => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index)
    }))
  }

  // タイトル変更（Step 3）
  const handleTitleChange = (title: string) => {
    setFormData(prev => ({ ...prev, title }))
  }

  // 次へ進む
  const handleNext = () => {
    if (currentStep === 1 && !formData.baseGenre) return
    if (currentStep === 2 && formData.conditions.length === 0) return
    if (currentStep === 3) {
      // 保存処理
      if (formData.title.trim() && !existingTitles.includes(formData.title.trim())) {
        onSave(formData)
        onClose()
      }
      return
    }
    setCurrentStep((prev) => (prev + 1) as ModalStep)
  }

  // 戻る
  const handleBack = () => {
    if (currentStep === 1) {
      onClose()
      return
    }
    setCurrentStep((prev) => (prev - 1) as ModalStep)
  }

  // タイトルの重複チェック
  const isTitleDuplicated = existingTitles.includes(formData.title.trim())
  const canProceed = currentStep === 1 ? !!formData.baseGenre 
    : currentStep === 2 ? formData.conditions.length > 0
    : formData.title.trim().length > 0 && !isTitleDuplicated

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>カスタムランキング作成</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        {/* ステップインジケーター */}
        <div className={styles.stepIndicator}>
          <div className={`${styles.step} ${currentStep >= 1 ? styles.active : ''}`}>
            <span className={styles.stepNumber}>1</span>
          </div>
          <div className={`${styles.stepLine} ${currentStep >= 2 ? styles.active : ''}`} />
          <div className={`${styles.step} ${currentStep >= 2 ? styles.active : ''}`}>
            <span className={styles.stepNumber}>2</span>
          </div>
          <div className={`${styles.stepLine} ${currentStep >= 3 ? styles.active : ''}`} />
          <div className={`${styles.step} ${currentStep >= 3 ? styles.active : ''}`}>
            <span className={styles.stepNumber}>3</span>
          </div>
        </div>

        <div className={styles.content}>
          {/* Step 1: ベースジャンル選択 */}
          {currentStep === 1 && (
            <div className={styles.stepContent}>
              <h3>どのジャンルのデータを使用しますか？</h3>
              <p className={styles.stepDescription}>
                フィルタリングのベースとなるジャンルを選択してください
              </p>
              <div className={styles.genreGrid}>
                {Object.entries(GENRE_LABELS).map(([value, label]) => {
                  if (value === 'custom') return null
                  return (
                    <label
                      key={value}
                      className={`${styles.genreOption} ${
                        formData.baseGenre === value ? styles.selected : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="baseGenre"
                        value={value}
                        checked={formData.baseGenre === value}
                        onChange={() => handleGenreSelect(value as RankingGenre)}
                      />
                      <span>{label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 2: タグ条件設定 */}
          {currentStep === 2 && (
            <div className={styles.stepContent}>
              <h3>タグ条件を設定してください</h3>
              <p className={styles.stepDescription}>
                動画に含まれるタグで絞り込み条件を設定します
              </p>

              {/* 現在の条件 */}
              {formData.conditions.length > 0 && (
                <div className={styles.currentConditions}>
                  <h4>現在の条件:</h4>
                  <div className={styles.conditionsList}>
                    {['AND', 'OR', 'NOT'].map(op => {
                      const conditions = formData.conditions.filter(c => c.operator === op)
                      if (conditions.length === 0) return null
                      return (
                        <div key={op} className={styles.conditionGroup}>
                          <span className={styles.operatorLabel}>{op}:</span>
                          <div className={styles.tags}>
                            {conditions.map((condition, index) => {
                              const originalIndex = formData.conditions.indexOf(condition)
                              return (
                                <span key={originalIndex} className={styles.tag}>
                                  {condition.tag}
                                  <button
                                    className={styles.removeTag}
                                    onClick={() => handleRemoveTag(originalIndex)}
                                  >
                                    ×
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* タグ入力 */}
              <div className={styles.tagInputSection}>
                <h4>新しい条件を追加:</h4>
                <div className={styles.tagInputWrapper}>
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddTag()
                      }
                    }}
                    placeholder="タグを入力"
                    className={styles.tagInput}
                  />
                  {showSuggestions && tagSuggestions.length > 0 && (
                    <div className={styles.suggestions}>
                      {tagSuggestions.map(suggestion => (
                        <button
                          key={suggestion}
                          className={styles.suggestionItem}
                          onClick={() => {
                            setTagInput(suggestion)
                            setShowSuggestions(false)
                            tagInputRef.current?.focus()
                          }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.operatorSelect}>
                  <label>条件タイプ:</label>
                  <div className={styles.operatorButtons}>
                    <button
                      className={`${styles.operatorButton} ${tagOperator === 'AND' ? styles.active : ''}`}
                      onClick={() => setTagOperator('AND')}
                    >
                      AND
                    </button>
                    <button
                      className={`${styles.operatorButton} ${tagOperator === 'OR' ? styles.active : ''}`}
                      onClick={() => setTagOperator('OR')}
                    >
                      OR
                    </button>
                    <button
                      className={`${styles.operatorButton} ${tagOperator === 'NOT' ? styles.active : ''}`}
                      onClick={() => setTagOperator('NOT')}
                    >
                      NOT
                    </button>
                  </div>
                </div>

                <button
                  className={styles.addButton}
                  onClick={handleAddTag}
                  disabled={!tagInput.trim()}
                >
                  追加
                </button>
              </div>
            </div>
          )}

          {/* Step 3: タイトル設定 */}
          {currentStep === 3 && (
            <div className={styles.stepContent}>
              <h3>カスタムランキングの名前を決めてください</h3>
              <p className={styles.stepDescription}>
                タグセレクターに表示される名前です
              </p>

              <div className={styles.titleInput}>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="例: レトロゲーム実況"
                  maxLength={20}
                  className={styles.titleField}
                />
                <div className={styles.charCount}>
                  {formData.title.length}/20
                </div>
              </div>

              {isTitleDuplicated && (
                <p className={styles.error}>
                  このタイトルは既に使用されています
                </p>
              )}

              <div className={styles.preview}>
                <h4>プレビュー:</h4>
                <div className={styles.previewBox}>
                  <span className={styles.previewLabel}>選択中のタグ</span>
                  <select className={styles.previewSelect}>
                    <option>{formData.title || 'タイトル未設定'}</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button
            className={styles.backButton}
            onClick={handleBack}
          >
            {currentStep === 1 ? 'キャンセル' : '戻る'}
          </button>
          <button
            className={styles.nextButton}
            onClick={handleNext}
            disabled={!canProceed}
          >
            {currentStep === 3 ? '保存' : '次へ'}
          </button>
        </div>
      </div>
    </div>
  )
}