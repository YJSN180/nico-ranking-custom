'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { GENRE_LABELS, type RankingGenre } from '@/types/ranking-config'
import type {
  CustomRanking,
  CustomRankingFormState,
  ModalStep,
} from '@/types/custom-ranking'
import { KeywordConditionEditor } from '@/components/keyword-condition-editor'
import {
  EMPTY_CUSTOM_CONDITIONS,
  TAG_SCOPES,
  TAG_SCOPE_LABELS,
  describeCustomConditions,
  fromTagConditions,
  hasCustomConditions,
  isTagScope,
  normalizeTagWord,
  scopeOf,
  toTagConditions,
  withConditions,
  withScope,
  type CustomConditionState,
} from '@/lib/custom-ranking-conditions'
import {
  EMPTY_KEYWORD_DRAFTS,
  commitKeywordDrafts,
  type KeywordDrafts,
} from '@/lib/search/keyword-conditions'
import { isImeComposing } from '@/lib/ime'
import styles from './custom-ranking-modal.module.css'

interface CustomRankingModalProps {
  isOpen: boolean
  onClose: () => void
  /** 保存する。false を返したら（または失敗したら）保存できなかったとして、画面を閉じずに知らせる */
  onSave: (data: CustomRankingFormState) => void | boolean | Promise<void | boolean>
  existingTitles?: string[]
  /** 編集対象のランキング（新規作成では無し） */
  editingRanking?: Pick<CustomRanking, 'baseGenre' | 'conditions' | 'title'> | null
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
  
  // タグ条件は検索の「条件で入力」と同じ 3 つの欄で編集する（判定の意味はカスタムランキングのまま）
  const [tagConditions, setTagConditions] = useState<CustomConditionState>(
    EMPTY_CUSTOM_CONDITIONS,
  )
  const [drafts, setDrafts] = useState<KeywordDrafts>(EMPTY_KEYWORD_DRAFTS)

  const modalRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const shownStep = useRef<ModalStep | null>(null)
  // 手順 2 の「次へ」で先読みを待つ間は進む操作を止める。待つ間に戻ったら、先読みのあとで進めない
  const [advancing, setAdvancing] = useState(false)
  // 保存の結果を待つ間は保存ボタンを止め、失敗したら入力を残したまま知らせる
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const navigation = useRef(0)
  // Escape・フォーカスの effect を開くときだけ動かすため、閉じる処理は ref で最新を参照する
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

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
        setTagConditions(fromTagConditions(editingRanking.conditions))
      } else {
        // 新規作成モードの場合はリセット
        setFormData({
          baseGenre: undefined,
          conditions: [],
          title: ''
        })
        setTagConditions(EMPTY_CUSTOM_CONDITIONS)
      }
      setDrafts(EMPTY_KEYWORD_DRAFTS)
      setAdvancing(false)
      setSaving(false)
      setSaveError(false)
      navigation.current++
    }
  }, [isOpen, editingRanking])

  // ダイアログの操作: Escape で閉じる・フォーカスをモーダル内に留める・閉じたら開いたボタンへ戻す
  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    modalRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // 日本語の変換中の Esc は変換の取り消し。タグ候補を閉じた Esc（defaultPrevented）でも閉じない。
        // どちらも閉じると作成途中の内容が消える
        if (isImeComposing(event) || event.defaultPrevented) return
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const modal = modalRef.current
      // 何かの理由でフォーカスがモーダルの外（ページ本体など）にあるときは、モーダルの中へ戻す
      if (modal && !modal.contains(document.activeElement)) {
        event.preventDefault()
        modal.focus()
        return
      }
      const focusables = modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea, [tabindex]:not([tabindex="-1"])',
      )
      const visible = Array.from(focusables ?? []).filter(
        (element) => element.offsetParent !== null,
      )
      const first = visible[0]
      const last = visible[visible.length - 1]
      if (!first || !last) return
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === modalRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [isOpen])

  // 手順が変わったら、その手順の最初の入力へフォーカスを移す（押したボタンが無効になって
  // フォーカスがページへ抜けると、キーボードでモーダルに戻れない）
  useEffect(() => {
    if (!isOpen) {
      shownStep.current = null
      return
    }
    if (shownStep.current !== null && shownStep.current !== currentStep) {
      const content = contentRef.current
      const target =
        content?.querySelector<HTMLElement>('input:checked') ??
        content?.querySelector<HTMLElement>('input[role="combobox"]') ??
        content?.querySelector<HTMLElement>('input, select, textarea, button')
      target?.focus()
    }
    shownStep.current = currentStep
  }, [isOpen, currentStep])

  if (!isOpen) return null

  // ベースジャンル選択（Step 1）
  const handleGenreSelect = (genre: RankingGenre) => {
    if (genre === 'custom') return // カスタムは選択不可
    setFormData(prev => ({ ...prev, baseGenre: genre }))
  }

  // 欄に打ちかけのタグも条件に含める（Enter を押し忘れても取りこぼさない）。
  // 説明文・「次へ」の可否・保存する条件は、すべてこの同じ内容から決める
  const committedTagConditions = withConditions(
    tagConditions,
    commitKeywordDrafts(tagConditions.conditions, drafts, normalizeTagWord),
  )

  const renderTagScope = (word: string): React.ReactNode => {
    const scope = scopeOf(tagConditions.scopes, word)
    return (
      <span
        className={`${styles.scope}${scope === 'both' ? '' : ` ${styles.scopeSet}`}`}
      >
        {/* 見えるのは小さな表示だけ。透明な選択欄を重ねて、操作・読み上げ・端末の選択画面は選択欄に任せる */}
        <span aria-hidden="true">{TAG_SCOPE_LABELS[scope]}</span>
        <ChevronDown size={12} aria-hidden="true" />
        <select
          aria-label={`「${word}」のタグ種別`}
          value={scope}
          onChange={(event) => {
            const next = event.target.value
            if (isTagScope(next)) {
              setTagConditions((prev) => withScope(prev, word, next))
            }
          }}
        >
          {TAG_SCOPES.map((option) => (
            <option key={option} value={option}>
              {TAG_SCOPE_LABELS[option]}
            </option>
          ))}
        </select>
      </span>
    )
  }

  // タイトル変更（Step 3）
  const handleTitleChange = (title: string) => {
    setSaveError(false)
    setFormData(prev => ({ ...prev, title }))
  }

  // 次へ進む
  const handleNext = async () => {
    if (advancing) return
    if (currentStep === 1 && !formData.baseGenre) return
    if (currentStep === 2) {
      const committed = committedTagConditions
      if (!hasCustomConditions(committed.conditions)) return
      setTagConditions(committed)
      setDrafts(EMPTY_KEYWORD_DRAFTS)
      setFormData((prev) => ({ ...prev, conditions: toTagConditions(committed) }))
    }
    if (currentStep === 3) {
      // 保存処理。保存できたときだけ閉じる（失敗したら入力を残して、もう一度保存できるようにする）
      if (saving) return
      if (formData.title.trim() && !existingTitles.includes(formData.title.trim())) {
        setSaving(true)
        setSaveError(false)
        let saved = false
        try {
          saved = (await onSave({ ...formData, conditions: toTagConditions(tagConditions) })) !== false
        } catch {
          saved = false
        } finally {
          setSaving(false)
        }
        if (!saved) {
          setSaveError(true)
          return
        }
        onClose()
      }
      return
    }
    
    // 進む先は押した時点の手順から決める（先読みの間に何度押しても 1 つだけ進む）
    const target: ModalStep = currentStep === 1 ? 2 : 3
    // ステップ2で「次へ」を押した時、baseGenreのデータをプリフェッチ
    if (currentStep === 2 && formData.baseGenre && onPrefetchData) {
      const token = ++navigation.current
      setAdvancing(true)
      try {
        await onPrefetchData(formData.baseGenre, currentPeriod)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[DEBUG] Prefetch failed:', error)
        // エラーが発生しても次のステップには進む
      } finally {
        setAdvancing(false)
      }
      // 待つ間に戻った・閉じたときは進めない
      if (token !== navigation.current) return
    }

    setCurrentStep(target)
  }

  // 戻る
  const handleBack = () => {
    navigation.current++
    if (currentStep === 1) {
      onClose()
      return
    }
    setCurrentStep((prev) => (prev - 1) as ModalStep)
  }

  // タイトルの重複チェック
  const isTitleDuplicated = existingTitles.includes(formData.title.trim())
  const canProceed = currentStep === 1 ? !!formData.baseGenre 
    : currentStep === 2 ? hasCustomConditions(committedTagConditions.conditions)
    : formData.title.trim().length > 0 && !isTitleDuplicated

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-ranking-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="custom-ranking-modal-title">{editingRanking ? 'カスタムランキング編集' : 'カスタムランキング作成'}</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="閉じる">×</button>
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

        <div className={styles.content} ref={contentRef}>
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

              <KeywordConditionEditor
                conditions={tagConditions.conditions}
                drafts={drafts}
                targets="tag"
                description={describeCustomConditions(committedTagConditions)}
                onConditionsChange={(next) =>
                  setTagConditions((prev) => withConditions(prev, next))
                }
                onDraftChange={(group, value) =>
                  setDrafts((prev) => ({ ...prev, [group]: value }))
                }
                normalizeWord={normalizeTagWord}
                renderWordControl={(_group, word) => renderTagScope(word)}
                groupJoin="または"
              />
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
              {saveError && (
                <p className={styles.error} role="alert">
                  保存できませんでした。もう一度「保存」を押してください。
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
            disabled={!canProceed || advancing}
            // 保存を待つ間は押せなくするが、disabled にはしない（押したボタンからフォーカスが外れ、
            // 失敗したあとキーボードでモーダルに戻れなくなるため）。二重の保存は handleNext で防ぐ
            aria-disabled={saving || undefined}
            aria-busy={advancing || saving || undefined}
          >
            {currentStep === 3 ? '保存' : '次へ'}
          </button>
        </div>
      </div>
    </div>
  )
}
