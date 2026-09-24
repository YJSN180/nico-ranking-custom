'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { GENRE_LABELS, type RankingGenre } from '@/types/ranking-config'
import type { CustomRankingFormState, ModalStep, TagCondition, TagOperator } from '@/types/custom-ranking'
import { TagIcon } from './tag-icon'
import { captureBrowserRateLimit } from '@/lib/sentry/capture'
import styles from './custom-ranking-modal.module.css'

// 演算子の自然言語ラベル
const OPERATOR_LABELS: Record<TagOperator, string> = {
  'AND': 'すべて含む',
  'OR': 'いずれかを含む',
  'NOT': '除外する'
}

// タグタイプのラベル
const TAG_TYPE_LABELS: Record<'lock' | 'user' | 'both', string> = {
  'lock': 'ロックタグ',
  'user': 'ユーザータグ',
  'both': '全タグ'
}

// 条件を自然言語で説明する関数
function generateConditionDescription(conditions: TagCondition[]): string {
  if (conditions.length === 0) return ''
  
  // グループ化
  const allAndConditions = conditions.filter(c => c.operator === 'AND')
  const allOrConditions = conditions.filter(c => c.operator === 'OR')
  const allNotConditions = conditions.filter(c => c.operator === 'NOT')
  
  let description = ''
  
  // AND条件とOR条件の組み合わせパターンを判定
  if (allAndConditions.length > 0 && allOrConditions.length > 0) {
    // 両方ある場合: (AND条件) または (OR条件)
    const andTags = allAndConditions.map(c => `「${c.tag}」（${TAG_TYPE_LABELS[c.tagType]}）`)
    const orTags = allOrConditions.map(c => `「${c.tag}」（${TAG_TYPE_LABELS[c.tagType]}）`)
    
    description = `${andTags.join('と')}をすべて含む動画、または、${orTags.join('もしくは')}のいずれかを含む動画`
  } else if (allAndConditions.length > 0) {
    // AND条件のみ
    const andTags = allAndConditions.map(c => `「${c.tag}」（${TAG_TYPE_LABELS[c.tagType]}）`)
    description = `${andTags.join('と')}をすべて含む動画`
  } else if (allOrConditions.length > 0) {
    // OR条件のみ
    const orTags = allOrConditions.map(c => `「${c.tag}」（${TAG_TYPE_LABELS[c.tagType]}）`)
    description = `${orTags.join('または')}のいずれかを含む動画`
  }
  
  // NOT条件
  if (allNotConditions.length > 0) {
    const notTags = allNotConditions.map(c => `「${c.tag}」（${TAG_TYPE_LABELS[c.tagType]}）`)
    if (description) {
      description += `（ただし、${notTags.join('と')}を含まない）`
    } else {
      description = `${notTags.join('と')}を含まない動画`
    }
  }
  
  return description
}

interface CustomRankingModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: CustomRankingFormState) => void
  existingTitles?: string[]
  editingRanking?: any // 編集対象のランキング
  onPrefetchData?: (baseGenre: RankingGenre, period: string) => Promise<void> // データプリフェッチ用
  currentPeriod?: string // 現在の期間設定
}

export function CustomRankingModal({ 
  isOpen, 
  onClose, 
  onSave, 
  existingTitles = [],
  editingRanking,
  onPrefetchData,
  currentPeriod = '24h'
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
  const [tagType, setTagType] = useState<'lock' | 'user' | 'both'>('both')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  
  const modalRef = useRef<HTMLDivElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const suggestionsAbortControllerRef = useRef<AbortController | null>(null)
  const latestRequestIdRef = useRef(0)

  // オートコンプリート用のAPIエンドポイント
  const getAutocompleteEndpoint = () => {
    // 本番環境とローカル開発環境でエンドポイントを切り替え
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
  const fetchTagSuggestions = useCallback(async (query: string, requestId: number): Promise<string[]> => {
    if (!query || query.trim().length < 2) {
      return []
    }

    suggestionsAbortControllerRef.current?.abort()
    const controller = new AbortController()
    suggestionsAbortControllerRef.current = controller

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
        signal: controller.signal,
      })

      if (requestId !== latestRequestIdRef.current) {
        return []
      }

      if (response.status === 429) {
        const retryAfterValue = response.headers.get('retry-after')
        const retryAfterSeconds = retryAfterValue ? Number(retryAfterValue) : undefined

        captureBrowserRateLimit({
          surface: 'tag-autocomplete',
          endpointFamily: '/api/tags/autocomplete',
          fingerprint: ['browser-tag-autocomplete-429'],
          retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
        })
        return []
      }

      if (!response.ok) {
        console.warn('Failed to fetch tag suggestions:', response.status)
        return []
      }

      const data = await response.json()
      return data.suggestions || []
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return []
      }
      console.error('Error fetching tag suggestions:', error)
      return []
    } finally {
      if (suggestionsAbortControllerRef.current === controller) {
        suggestionsAbortControllerRef.current = null
      }
      if (requestId === latestRequestIdRef.current) {
        setIsLoadingSuggestions(false)
      }
    }
  }, [])

  // デバウンス処理付きオートコンプリート
  useEffect(() => {
    latestRequestIdRef.current += 1
    suggestionsAbortControllerRef.current?.abort()

    const timeoutId = setTimeout(async () => {
      if (tagInput.trim().length >= 2) {
        const requestId = ++latestRequestIdRef.current
        const suggestions = await fetchTagSuggestions(tagInput, requestId)
        if (requestId !== latestRequestIdRef.current) {
          return
        }
        setTagSuggestions(suggestions)
        setShowSuggestions(suggestions.length > 0)
        setSelectedSuggestionIndex(-1) // 候補リストが更新されたら選択をリセット
      } else {
        latestRequestIdRef.current += 1
        suggestionsAbortControllerRef.current?.abort()
        setTagSuggestions([])
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        setIsLoadingSuggestions(false)
      }
    }, 300) // 300msデバウンス

    return () => {
      clearTimeout(timeoutId)
      suggestionsAbortControllerRef.current?.abort()
    }
  }, [tagInput, fetchTagSuggestions])

  // モーダルが開いた時にリセットまたは初期化
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1)
      if (editingRanking) {
        // 編集モードの場合は既存データで初期化
        setFormData({
          baseGenre: editingRanking.baseGenre,
          conditions: editingRanking.conditions || [],
          title: editingRanking.title
        })
      } else {
        // 新規作成モードの場合はリセット
        setFormData({
          baseGenre: undefined,
          conditions: [],
          title: ''
        })
      }
      setTagInput('')
      setTagOperator('AND')
      setTagType('both')
      setTagSuggestions([])
      setShowSuggestions(false)
      setSelectedSuggestionIndex(-1)
    }
  }, [isOpen, editingRanking])

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
      operator: tagOperator,
      tagType: tagType
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
  const handleNext = async () => {
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
    
    // ステップ2で「次へ」を押した時、baseGenreのデータをプリフェッチ
    if (currentStep === 2 && formData.baseGenre && onPrefetchData) {
      try {
        await onPrefetchData(formData.baseGenre, currentPeriod)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[DEBUG] Prefetch failed:', error)
        // エラーが発生しても次のステップには進む
      }
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
          <h2>{editingRanking ? 'カスタムランキング編集' : 'カスタムランキング作成'}</h2>
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
                  <div className={styles.conditionDescription}>
                    {generateConditionDescription(formData.conditions)}
                  </div>
                  <div className={styles.conditionsList}>
                    {(['AND', 'OR', 'NOT'] as TagOperator[]).map(op => {
                      const conditions = formData.conditions.filter(c => c.operator === op)
                      if (conditions.length === 0) return null
                      return (
                        <div key={op} className={styles.conditionGroup}>
                          <span className={styles.operatorLabel}>{OPERATOR_LABELS[op]}:</span>
                          <div className={styles.tags}>
                            {conditions.map((condition, index) => {
                              const originalIndex = formData.conditions.indexOf(condition)
                              const tagTypeLabel = condition.tagType === 'lock' ? 'ロック' 
                                : condition.tagType === 'user' ? 'ユーザー' 
                                : '両方'
                              return (
                                <span key={originalIndex} className={styles.tag}>
                                  {condition.tag}
                                  <span className={styles.tagTypeIndicator}>
                                    ({tagTypeLabel})
                                  </span>
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
                {formData.conditions.length === 0 && (
                  <p className={styles.helpText}>
                    最初のタグの条件を設定してください
                  </p>
                )}
                <div className={styles.tagInputWrapper}>
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (showSuggestions && selectedSuggestionIndex >= 0 && selectedSuggestionIndex < tagSuggestions.length) {
                          // 選択された候補を使用
                          setTagInput(tagSuggestions[selectedSuggestionIndex])
                          setShowSuggestions(false)
                          setSelectedSuggestionIndex(-1)
                        } else {
                          // 通常のタグ追加
                          handleAddTag()
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
                    }}
                    placeholder="タグを入力"
                    className={styles.tagInput}
                  />
                  {showSuggestions && (
                    <div className={styles.suggestions}>
                      {isLoadingSuggestions ? (
                        <div className={styles.loadingMessage}>
                          検索中...
                        </div>
                      ) : tagSuggestions.length > 0 ? (
                        tagSuggestions.map((suggestion, index) => (
                          <button
                            key={suggestion}
                            className={`${styles.suggestionItem} ${
                              index === selectedSuggestionIndex ? styles.suggestionItemSelected : ''
                            }`}
                            onClick={() => {
                              setTagInput(suggestion)
                              setShowSuggestions(false)
                              setSelectedSuggestionIndex(-1)
                              tagInputRef.current?.focus()
                            }}
                            onMouseEnter={() => setSelectedSuggestionIndex(index)}
                          >
                            {suggestion}
                          </button>
                        ))
                      ) : (
                        <div className={styles.noResultsMessage}>
                          候補が見つかりませんでした
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 演算子選択 */}
                <div className={styles.operatorSelect}>
                  <label>条件の組み合わせ方:</label>
                  <div className={styles.operatorButtons}>
                    {/* 最初のタグの場合は「含む」「除外する」のみ表示 */}
                    {formData.conditions.length === 0 ? (
                      <>
                        <button
                          className={`${styles.operatorButton} ${tagOperator === 'AND' ? styles.active : ''}`}
                          onClick={() => setTagOperator('AND')}
                          title="選択したタグを含む動画のみ表示"
                        >
                          含む
                        </button>
                        <button
                          className={`${styles.operatorButton} ${tagOperator === 'NOT' ? styles.active : ''}`}
                          onClick={() => setTagOperator('NOT')}
                          title="選択したタグを含まない動画のみ表示"
                        >
                          {OPERATOR_LABELS.NOT}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={`${styles.operatorButton} ${tagOperator === 'AND' ? styles.active : ''}`}
                          onClick={() => setTagOperator('AND')}
                          title="選択したタグをすべて含む動画のみ表示"
                        >
                          {OPERATOR_LABELS.AND}
                        </button>
                        <button
                          className={`${styles.operatorButton} ${tagOperator === 'OR' ? styles.active : ''}`}
                          onClick={() => setTagOperator('OR')}
                          title="選択したタグのいずれかを含む動画を表示"
                        >
                          {OPERATOR_LABELS.OR}
                        </button>
                        <button
                          className={`${styles.operatorButton} ${tagOperator === 'NOT' ? styles.active : ''}`}
                          onClick={() => setTagOperator('NOT')}
                          title="選択したタグを含まない動画のみ表示"
                        >
                          {OPERATOR_LABELS.NOT}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className={styles.tagTypeSelect}>
                  <label>タグ種別:</label>
                  <div className={styles.tagTypeButtons}>
                    <button
                      className={`${styles.tagTypeButton} ${tagType === 'lock' ? styles.active : ''}`}
                      onClick={() => setTagType('lock')}
                      title="運営が設定したロックタグのみ対象"
                    >
                      <TagIcon type="locked" size={16} />
                      ロックタグ
                    </button>
                    <button
                      className={`${styles.tagTypeButton} ${tagType === 'user' ? styles.active : ''}`}
                      onClick={() => setTagType('user')}
                      title="ユーザーが設定したタグのみ対象"
                    >
                      <TagIcon type="user" size={16} />
                      ユーザータグ
                    </button>
                    <button
                      className={`${styles.tagTypeButton} ${tagType === 'both' ? styles.active : ''}`}
                      onClick={() => setTagType('both')}
                      title="ロックタグとユーザータグの両方を対象"
                    >
                      <TagIcon type="both" size={16} />
                      両方
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

              {/* タグボタンスタイルのプレビュー */}
              {formData.title && (
                <div className={styles.preview}>
                  <p className={styles.previewLabel}>プレビュー:</p>
                  <div className={styles.previewContainer}>
                    <button className={`${styles.previewButton} ${styles.tagButton}`} disabled>
                      {formData.title}
                    </button>
                  </div>
                </div>
              )}
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
