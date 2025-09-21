'use client'

import { useState, useEffect, useRef } from 'react'
import { useUserNGListExtended } from '../hooks/use-user-ng-list-extended'
import type { ExtendedUserNGList } from '../types/ng-list-extended'
import { useUserPreferences, type ThemeType } from '../hooks/use-user-preferences'
import { NGBackup } from './ng-backup'
import { GenreOrderBackup } from './genre-order-backup'
import { CustomRankingBackup } from './custom-ranking-backup'
import { MylistBackup } from './mylist-backup'
import { UnifiedBackup } from './unified-backup'
import { GenreOrderCustomizer, type GenreOrderCustomizerRef } from './genre-order'
import { NGTagsSection } from './ng-tags-section'
import styles from './settings-modal.module.css'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onApply?: () => void
}

export function SettingsModal({ isOpen, onClose, onApply }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'display' | 'nglist' | 'genre-order' | 'ng-backup'>('nglist')
  const [inputVideoId, setInputVideoId] = useState('')
  const [inputVideoTitle, setInputVideoTitle] = useState('')
  const [videoTitleType, setVideoTitleType] = useState<'exact' | 'partial'>('partial')
  const [inputAuthorId, setInputAuthorId] = useState('')
  const [inputAuthorName, setInputAuthorName] = useState('')
  const [authorNameType, setAuthorNameType] = useState<'exact' | 'partial'>('exact')

  // 一括追加用のstate
  const [bulkVideoIds, setBulkVideoIds] = useState('')
  const [bulkAuthorIds, setBulkAuthorIds] = useState('')
  const [showBulkVideoIds, setShowBulkVideoIds] = useState(false)
  const [showBulkAuthorIds, setShowBulkAuthorIds] = useState(false)

  // 動画タイトル一括追加用
  const [bulkVideoTitles, setBulkVideoTitles] = useState('')
  const [showBulkVideoTitles, setShowBulkVideoTitles] = useState(false)

  // 投稿者名一括追加用
  const [bulkAuthorNames, setBulkAuthorNames] = useState('')
  const [showBulkAuthorNames, setShowBulkAuthorNames] = useState(false)

  // タグ一括追加用
  const [bulkTags, setBulkTags] = useState('')
  const [showBulkTags, setShowBulkTags] = useState(false)
  const [bulkTagType, setBulkTagType] = useState<'locked' | 'user' | 'both'>('both')
  const [bulkTagMatchType, setBulkTagMatchType] = useState<'exact' | 'partial'>('partial')

  const { ngList, saveNGListDirectly } = useUserNGListExtended()
  
  // 一時的なNGリストの状態
  const [tempNGList, setTempNGList] = useState<ExtendedUserNGList>(ngList)
  const [hasChanges, setHasChanges] = useState(false)
  const [hasGenreOrderChanges, setHasGenreOrderChanges] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  
  // ジャンル並び替えコンポーネントの参照
  const genreOrderRef = useRef<GenreOrderCustomizerRef | null>(null)
  
  // NGリストが変更されたら一時リストも更新（モーダルを開いた時）
  useEffect(() => {
    if (isOpen) {
      setTempNGList(ngList)
      setHasChanges(false)
      setHasGenreOrderChanges(false)
    }
  }, [isOpen, ngList])
  
  // 変更検知
  useEffect(() => {
    const isChanged = JSON.stringify(tempNGList) !== JSON.stringify(ngList)
    setHasChanges(isChanged)
  }, [tempNGList, ngList])

  const { preferences, updatePreferences } = useUserPreferences()

  if (!isOpen) return null

  // 一時リストへの操作メソッド
  const handleAddVideoId = () => {
    const id = inputVideoId.trim()
    if (id && !tempNGList.videoIds.includes(id)) {
      setTempNGList(prev => ({
        ...prev,
        videoIds: [...prev.videoIds, id],
        totalCount: prev.totalCount + 1
      }))
      setInputVideoId('')
    }
  }

  const handleAddVideoTitle = () => {
    const title = inputVideoTitle.trim()
    if (title) {
      const list = videoTitleType === 'exact' 
        ? tempNGList.videoTitles.exact 
        : tempNGList.videoTitles.partial
      
      if (!list.includes(title)) {
        setTempNGList(prev => ({
          ...prev,
          videoTitles: {
            ...prev.videoTitles,
            [videoTitleType]: [...prev.videoTitles[videoTitleType], title]
          },
          totalCount: prev.totalCount + 1
        }))
        setInputVideoTitle('')
      }
    }
  }

  const handleAddAuthorId = () => {
    const id = inputAuthorId.trim()
    if (id && !tempNGList.authorIds.includes(id)) {
      setTempNGList(prev => ({
        ...prev,
        authorIds: [...prev.authorIds, id],
        totalCount: prev.totalCount + 1
      }))
      setInputAuthorId('')
    }
  }

  const handleAddAuthorName = () => {
    const name = inputAuthorName.trim()
    if (name) {
      const list = authorNameType === 'exact' 
        ? tempNGList.authorNames.exact 
        : tempNGList.authorNames.partial
      
      if (!list.includes(name)) {
        setTempNGList(prev => ({
          ...prev,
          authorNames: {
            ...prev.authorNames,
            [authorNameType]: [...prev.authorNames[authorNameType], name]
          },
          totalCount: prev.totalCount + 1
        }))
        setInputAuthorName('')
      }
    }
  }
  
  // 削除メソッド
  const removeVideoId = (id: string) => {
    setTempNGList(prev => ({
      ...prev,
      videoIds: prev.videoIds.filter(v => v !== id),
      totalCount: prev.totalCount - 1
    }))
  }
  
  const removeVideoTitle = (title: string, type: 'exact' | 'partial') => {
    setTempNGList(prev => ({
      ...prev,
      videoTitles: {
        ...prev.videoTitles,
        [type]: prev.videoTitles[type].filter(t => t !== title)
      },
      totalCount: prev.totalCount - 1
    }))
  }
  
  const removeAuthorId = (id: string) => {
    setTempNGList(prev => ({
      ...prev,
      authorIds: prev.authorIds.filter(a => a !== id),
      totalCount: prev.totalCount - 1
    }))
  }
  
  const removeAuthorName = (name: string, type: 'exact' | 'partial') => {
    setTempNGList(prev => ({
      ...prev,
      authorNames: {
        ...prev.authorNames,
        [type]: prev.authorNames[type].filter(n => n !== name)
      },
      totalCount: prev.totalCount - 1
    }))
  }

  // 一括追加処理
  const handleBulkAddVideoIds = () => {
    const input = bulkVideoIds.trim()
    if (!input) return

    const newIds = input
      .split(/[\r\n]+/)
      .map(id => id.trim())
      .filter(id => id !== '')
      .filter(id => !tempNGList.videoIds.includes(id))

    if (newIds.length > 0) {
      setTempNGList(prev => ({
        ...prev,
        videoIds: [...prev.videoIds, ...newIds],
        totalCount: prev.totalCount + newIds.length
      }))
      setBulkVideoIds('')
      setShowBulkVideoIds(false)
      // alert(`${newIds.length}件の動画IDを追加しました`)
    } else {
      // alert('追加する新しいIDがありません（すべて重複しています）')
    }
  }

  const handleBulkAddAuthorIds = () => {
    const input = bulkAuthorIds.trim()
    if (!input) return

    const newIds = input
      .split(/[\r\n]+/)
      .map(id => id.trim())
      .filter(id => id !== '')
      .filter(id => !tempNGList.authorIds.includes(id))

    if (newIds.length > 0) {
      setTempNGList(prev => ({
        ...prev,
        authorIds: [...prev.authorIds, ...newIds],
        totalCount: prev.totalCount + newIds.length
      }))
      setBulkAuthorIds('')
      setShowBulkAuthorIds(false)
      // alert(`${newIds.length}件の投稿者IDを追加しました`)
    } else {
      // alert('追加する新しいIDがありません（すべて重複しています）')
    }
  }

  // 動画タイトル一括追加処理
  const handleBulkAddVideoTitles = () => {
    const input = bulkVideoTitles.trim()
    if (!input) {
      // alert('動画タイトルを入力してください')
      return
    }

    const newTitles = input
      .split(/[\r\n]+/)
      .map(title => title.trim())
      .filter(title => title !== '')
      .filter(title => !tempNGList.videoTitles[videoTitleType].includes(title))

    if (newTitles.length > 0) {
      setTempNGList(prev => ({
        ...prev,
        videoTitles: {
          ...prev.videoTitles,
          [videoTitleType]: [...prev.videoTitles[videoTitleType], ...newTitles]
        },
        totalCount: prev.totalCount + newTitles.length
      }))
      setBulkVideoTitles('')
      setShowBulkVideoTitles(false)
      // alert(`${newTitles.length}件の動画タイトル（${videoTitleType === 'exact' ? '完全一致' : '部分一致'}）を追加しました`)
    } else {
      // alert('追加する新しいタイトルがありません（すべて重複しています）')
    }
  }

  // 投稿者名一括追加処理
  const handleBulkAddAuthorNames = () => {
    const input = bulkAuthorNames.trim()
    if (!input) {
      // alert('投稿者名を入力してください')
      return
    }

    const newNames = input
      .split(/[\r\n]+/)
      .map(name => name.trim())
      .filter(name => name !== '')
      .filter(name => !tempNGList.authorNames[authorNameType].includes(name))

    if (newNames.length > 0) {
      setTempNGList(prev => ({
        ...prev,
        authorNames: {
          ...prev.authorNames,
          [authorNameType]: [...prev.authorNames[authorNameType], ...newNames]
        },
        totalCount: prev.totalCount + newNames.length
      }))
      setBulkAuthorNames('')
      setShowBulkAuthorNames(false)
      // alert(`${newNames.length}件の投稿者名（${authorNameType === 'exact' ? '完全一致' : '部分一致'}）を追加しました`)
    } else {
      // alert('追加する新しい名前がありません（すべて重複しています）')
    }
  }

  // タグ一括追加処理
  const handleBulkAddTags = () => {
    const input = bulkTags.trim()
    if (!input) {
      // alert('タグを入力してください')
      return
    }

    const newTags = input
      .split(/[\r\n]+/)
      .map(tag => tag.trim())
      .filter(tag => tag !== '')

    // タグが存在することを確認
    if (!tempNGList.tags) {
      setTempNGList(prev => ({
        ...prev,
        tags: {
          locked: { exact: [], partial: [] },
          user: { exact: [], partial: [] },
          both: { exact: [], partial: [] }
        }
      }))
    }

    const existingTags = tempNGList.tags?.[bulkTagType]?.[bulkTagMatchType] || []
    const uniqueNewTags = newTags.filter(tag => !existingTags.includes(tag))

    if (uniqueNewTags.length > 0) {
      setTempNGList(prev => ({
        ...prev,
        tags: {
          ...prev.tags!,
          [bulkTagType]: {
            ...prev.tags![bulkTagType],
            [bulkTagMatchType]: [...(prev.tags?.[bulkTagType]?.[bulkTagMatchType] || []), ...uniqueNewTags]
          }
        },
        totalCount: prev.totalCount + uniqueNewTags.length
      }))
      setBulkTags('')
      setShowBulkTags(false)

      const typeLabel = bulkTagType === 'locked' ? 'ロックタグ' : bulkTagType === 'user' ? 'ユーザータグ' : '両方'
      const matchLabel = bulkTagMatchType === 'exact' ? '完全一致' : '部分一致'
      // alert(`${uniqueNewTags.length}件のタグ（${typeLabel}・${matchLabel}）を追加しました`)
    } else {
      // alert('追加する新しいタグがありません（すべて重複しています）')
    }
  }

  // 適用処理
  const handleApply = () => {
    if (activeTab === 'nglist') {
      // NGリストを保存（即座に反映される）
      saveNGListDirectly(tempNGList)
      
      // onApplyコールバックがあれば呼び出す
      if (onApply) {
        onApply()
      }
      
      // モーダルを閉じる
      onClose()
    } else if (activeTab === 'genre-order' && genreOrderRef.current) {
      // ジャンル並び替えを適用（内部でリロード）
      genreOrderRef.current.applyChanges()
    }
  }
  
  // 閉じる処理
  const handleClose = () => {
    // ドラッグ中は閉じない
    if (isDragging) {
      return
    }
    
    if (hasChanges || hasGenreOrderChanges) {
      if (confirm('変更を破棄してもよろしいですか？')) {
        setTempNGList(ngList)  // 元に戻す
        if (hasGenreOrderChanges && genreOrderRef.current) {
          genreOrderRef.current.cancelChanges()
        }
        onClose()
      }
    } else {
      onClose()
    }
  }
  
  // オーバーレイクリック時の処理（ドラッグ中は閉じない）
  const handleOverlayClick = () => {
    if (!isDragging) {
      onClose()
    }
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>設定</h2>
          <button className={styles.closeButton} onClick={handleClose}>×</button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'display' ? styles.active : ''}`}
            onClick={() => setActiveTab('display')}
          >
            <span style={{ whiteSpace: 'nowrap' }}>🎨&nbsp;テーマ</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'nglist' ? styles.active : ''}`}
            onClick={() => setActiveTab('nglist')}
          >
            <span style={{ whiteSpace: 'nowrap' }}>🚫&nbsp;NGリスト</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'genre-order' ? styles.active : ''}`}
            onClick={() => setActiveTab('genre-order')}
          >
            <span style={{ whiteSpace: 'nowrap' }}>🎯&nbsp;ジャンル</span>
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'ng-backup' ? styles.active : ''}`}
            onClick={() => setActiveTab('ng-backup')}
          >
            <span style={{ whiteSpace: 'nowrap' }}>💾&nbsp;バックアップ</span>
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === 'display' ? (
            <div className={styles.displaySettings}>
              <section className={styles.section}>
                <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                  <legend style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
                    🎨 テーマ設定
                  </legend>
                  <div>
                  <label style={{ display: 'block', marginBottom: '12px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="light"
                      checked={preferences.theme === 'light'}
                      onChange={() => {
                        updatePreferences({ theme: 'light' })
                        // 即座にdata-theme属性を更新
                        document.documentElement.setAttribute('data-theme', 'light')
                      }}
                      style={{ marginRight: '8px' }}
                    />
                    <span style={{ fontSize: '16px' }}>☀️ ライトモード</span>
                    <span style={{ 
                      display: 'block', 
                      marginLeft: '24px', 
                      fontSize: '14px', 
                      color: 'var(--text-secondary)',
                      marginTop: '4px'
                    }}>
                      明るい背景に黒文字の標準的なテーマ
                    </span>
                  </label>
                  
                  <label style={{ display: 'block', marginBottom: '12px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="dark"
                      checked={preferences.theme === 'dark'}
                      onChange={() => {
                        updatePreferences({ theme: 'dark' })
                        // 即座にdata-theme属性を更新
                        document.documentElement.setAttribute('data-theme', 'dark')
                      }}
                      style={{ marginRight: '8px' }}
                    />
                    <span style={{ fontSize: '16px' }}>🌙 ダークモード</span>
                    <span style={{ 
                      display: 'block', 
                      marginLeft: '24px', 
                      fontSize: '14px', 
                      color: 'var(--text-secondary)',
                      marginTop: '4px'
                    }}>
                      暗い背景に白文字で目に優しいテーマ
                    </span>
                  </label>
                  
                  <label style={{ display: 'block', marginBottom: '12px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="darkblue"
                      checked={preferences.theme === 'darkblue'}
                      onChange={() => {
                        updatePreferences({ theme: 'darkblue' })
                        // 即座にdata-theme属性を更新
                        document.documentElement.setAttribute('data-theme', 'darkblue')
                      }}
                      style={{ marginRight: '8px' }}
                    />
                    <span style={{ fontSize: '16px' }}>🌌 ダークブルー</span>
                    <span style={{ 
                      display: 'block', 
                      marginLeft: '24px', 
                      fontSize: '14px', 
                      color: 'var(--text-secondary)',
                      marginTop: '4px'
                    }}>
                      深い青を基調とした落ち着いたテーマ
                    </span>
                  </label>
                  </div>
                </fieldset>
              </section>
            </div>
          ) : activeTab === 'nglist' ? (
            <div className={styles.ngListSettings}>
              {/* 動画ID */}
              <section className={styles.section}>
                <h3>🚫 動画ID</h3>
                <div className={styles.list}>
                  {tempNGList.videoIds.map((id) => (
                    <div key={id} className={styles.listItem}>
                      <span>{id}</span>
                      <button onClick={() => removeVideoId(id)}>×</button>
                    </div>
                  ))}
                </div>
                <div className={styles.inputRow}>
                  <input
                    type="text"
                    value={inputVideoId}
                    onChange={(e) => setInputVideoId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddVideoId()}
                    placeholder="sm12345678"
                  />
                  <button onClick={handleAddVideoId}>追加</button>
                </div>

                {/* 一括追加セクション */}
                <div style={{ marginTop: '12px' }}>
                  <button
                    onClick={() => setShowBulkVideoIds(!showBulkVideoIds)}
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
                    {showBulkVideoIds ? '▼' : '▶'} 複数IDを一括追加
                  </button>

                  {showBulkVideoIds && (
                    <div style={{ marginTop: '12px' }}>
                      <textarea
                        value={bulkVideoIds}
                        onChange={(e) => setBulkVideoIds(e.target.value)}
                        placeholder="複数の動画IDを改行区切りで入力\n例:\nsm12345678\nsm87654321\nsm11111111"
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
                        onClick={handleBulkAddVideoIds}
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
              </section>

              {/* 動画タイトル */}
              <section className={styles.section}>
                <h3>🚫 動画タイトル</h3>
                <div className={styles.radioGroup}>
                  <label>
                    <input
                      type="radio"
                      value="exact"
                      checked={videoTitleType === 'exact'}
                      onChange={(e) => setVideoTitleType(e.target.value as 'exact' | 'partial')}
                    />
                    完全一致
                  </label>
                  <label>
                    <input
                      type="radio"
                      value="partial"
                      checked={videoTitleType === 'partial'}
                      onChange={(e) => setVideoTitleType(e.target.value as 'exact' | 'partial')}
                    />
                    部分一致
                  </label>
                </div>
                <div className={styles.list}>
                  {tempNGList.videoTitles.exact.map((title) => (
                    <div key={title} className={styles.listItem}>
                      <span>{title} (完全)</span>
                      <button onClick={() => removeVideoTitle(title, 'exact')}>×</button>
                    </div>
                  ))}
                  {tempNGList.videoTitles.partial.map((title) => (
                    <div key={title} className={styles.listItem}>
                      <span>{title} (部分)</span>
                      <button onClick={() => removeVideoTitle(title, 'partial')}>×</button>
                    </div>
                  ))}
                </div>
                <div className={styles.inputRow}>
                  <input
                    type="text"
                    value={inputVideoTitle}
                    onChange={(e) => setInputVideoTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddVideoTitle()}
                    placeholder="タイトルを入力"
                  />
                  <button onClick={handleAddVideoTitle}>追加</button>
                </div>

                {/* 動画タイトル一括追加セクション */}
                <div style={{ marginTop: '12px' }}>
                  <button
                    onClick={() => setShowBulkVideoTitles(!showBulkVideoTitles)}
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
                    {showBulkVideoTitles ? '▼' : '▶'} 複数タイトルを一括追加
                  </button>
                  {showBulkVideoTitles && (
                    <div style={{ marginTop: '12px' }}>
                      <textarea
                        value={bulkVideoTitles}
                        onChange={(e) => setBulkVideoTitles(e.target.value)}
                        placeholder={`動画タイトル（${videoTitleType === 'exact' ? '完全一致' : '部分一致'}）を改行区切りで入力\n例:\nアニメ総集編\nMAD動画\n歌ってみた`}
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
                        onClick={handleBulkAddVideoTitles}
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
              </section>

              {/* 投稿者 */}
              <section className={styles.section}>
                <h3>🚫 投稿者</h3>
                <div className={styles.subsection}>
                  <h4>ID</h4>
                  <div className={styles.list}>
                    {tempNGList.authorIds.map((id) => (
                      <div key={id} className={styles.listItem}>
                        <span>ID: {id}</span>
                        <button onClick={() => removeAuthorId(id)}>×</button>
                      </div>
                    ))}
                  </div>
                  <div className={styles.inputRow}>
                    <input
                      type="text"
                      value={inputAuthorId}
                      onChange={(e) => setInputAuthorId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddAuthorId()}
                      placeholder="投稿者ID"
                    />
                    <button onClick={handleAddAuthorId}>追加</button>
                  </div>

                  {/* 投稿者ID一括追加セクション */}
                  <div style={{ marginTop: '12px' }}>
                    <button
                      onClick={() => setShowBulkAuthorIds(!showBulkAuthorIds)}
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
                      {showBulkAuthorIds ? '▼' : '▶'} 複数IDを一括追加
                    </button>

                    {showBulkAuthorIds && (
                      <div style={{ marginTop: '12px' }}>
                        <textarea
                          value={bulkAuthorIds}
                          onChange={(e) => setBulkAuthorIds(e.target.value)}
                          placeholder="複数の投稿者IDを改行区切りで入力\n例:\nuser123\nuser456\nuser789"
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
                          onClick={handleBulkAddAuthorIds}
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
                </div>

                <div className={styles.subsection}>
                  <h4>名前</h4>
                  <div className={styles.radioGroup}>
                    <label>
                      <input
                        type="radio"
                        value="exact"
                        checked={authorNameType === 'exact'}
                        onChange={(e) => setAuthorNameType(e.target.value as 'exact' | 'partial')}
                      />
                      完全一致
                    </label>
                    <label>
                      <input
                        type="radio"
                        value="partial"
                        checked={authorNameType === 'partial'}
                        onChange={(e) => setAuthorNameType(e.target.value as 'exact' | 'partial')}
                      />
                      部分一致
                    </label>
                  </div>
                  <div className={styles.list}>
                    {tempNGList.authorNames.exact.map((name) => (
                      <div key={name} className={styles.listItem}>
                        <span>名前: {name} (完全)</span>
                        <button onClick={() => removeAuthorName(name, 'exact')}>×</button>
                      </div>
                    ))}
                    {tempNGList.authorNames.partial.map((name) => (
                      <div key={name} className={styles.listItem}>
                        <span>名前: {name} (部分)</span>
                        <button onClick={() => removeAuthorName(name, 'partial')}>×</button>
                      </div>
                    ))}
                  </div>
                  <div className={styles.inputRow}>
                    <input
                      type="text"
                      value={inputAuthorName}
                      onChange={(e) => setInputAuthorName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddAuthorName()}
                      placeholder="投稿者名"
                    />
                    <button onClick={handleAddAuthorName}>追加</button>
                  </div>

                  {/* 投稿者名一括追加セクション */}
                  <div style={{ marginTop: '12px' }}>
                    <button
                      onClick={() => setShowBulkAuthorNames(!showBulkAuthorNames)}
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
                      {showBulkAuthorNames ? '▼' : '▶'} 複数名を一括追加
                    </button>
                    {showBulkAuthorNames && (
                      <div style={{ marginTop: '12px' }}>
                        <textarea
                          value={bulkAuthorNames}
                          onChange={(e) => setBulkAuthorNames(e.target.value)}
                          placeholder={`投稿者名（${authorNameType === 'exact' ? '完全一致' : '部分一致'}）を改行区切りで入力\n例:\nテスト投稿者\nサンプルユーザー\n投稿者A`}
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
                          onClick={handleBulkAddAuthorNames}
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
                </div>
              </section>

              {/* タグ */}
              {tempNGList.tags && (
                <>
                  <NGTagsSection
                    tags={tempNGList.tags}
                    onUpdate={(tags) => {
                      setTempNGList(prev => ({
                        ...prev,
                        tags
                      }))
                    }}
                  />

                  {/* タグ一括追加セクション */}
                  <section className={styles.section} style={{ marginTop: '-20px' }}>
                    <div style={{ marginTop: '12px' }}>
                      <button
                        onClick={() => setShowBulkTags(!showBulkTags)}
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
                              onChange={(e) => setBulkTagType(e.target.value as 'locked' | 'user' | 'both')}
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
                                  onChange={(e) => setBulkTagMatchType(e.target.value as 'exact' | 'partial')}
                                  style={{ marginRight: '6px' }}
                                />
                                <span style={{ fontSize: '14px' }}>完全一致</span>
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  value="partial"
                                  checked={bulkTagMatchType === 'partial'}
                                  onChange={(e) => setBulkTagMatchType(e.target.value as 'exact' | 'partial')}
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
                            onChange={(e) => setBulkTags(e.target.value)}
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
                            onClick={handleBulkAddTags}
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
                  </section>
                </>
              )}
            </div>
          ) : activeTab === 'genre-order' ? (
            <div className={styles.genreOrderSettings}>
              <section className={styles.section}>
                <h3>🎯 ジャンル並び替え</h3>
                <GenreOrderCustomizer 
                  ref={genreOrderRef}
                  onChangesUpdate={setHasGenreOrderChanges}
                  onDragStateChange={setIsDragging}
                />
              </section>
            </div>
          ) : (
            <div className={styles.ngBackupSettings}>
              <section className={styles.section}>
                <h3>📦 まとめて管理</h3>
                <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  すべての設定データ（NGリスト、ジャンル並び替え、カスタムランキング、マイリスト）を一つのファイルにまとめてバックアップできます。
                </p>
                <UnifiedBackup />
              </section>
              
              <section className={styles.section} style={{ marginTop: '1rem' }}>
                <h3>💾 NGリストバックアップ</h3>
                <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  現在適用されているNGリストをバックアップファイルとしてエクスポートしたり、他のデバイスからインポートできます。
                </p>
                <NGBackup />
              </section>
              
              <section className={styles.section} style={{ marginTop: '1rem' }}>
                <h3>🎯 ジャンル並び替えデータバックアップ</h3>
                <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  ジャンルの表示順序と表示/非表示設定をバックアップファイルとしてエクスポートしたり、他のデバイスからインポートできます。
                </p>
                <GenreOrderBackup />
              </section>
              
              <section className={styles.section} style={{ marginTop: '1rem' }}>
                <h3>⭐ カスタムランキングデータバックアップ</h3>
                <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  カスタムランキング設定をバックアップファイルとしてエクスポートしたり、他のデバイスからインポートできます。
                </p>
                <CustomRankingBackup />
              </section>
              
              <section className={styles.section} style={{ marginTop: '1rem' }}>
                <h3>📚 マイリストデータバックアップ</h3>
                <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  すべてのマイリストと動画データをバックアップファイルとしてエクスポートしたり、他のデバイスからインポートできます。
                </p>
                <MylistBackup />
              </section>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.stats}>
            {activeTab === 'nglist' && (
              <>
                NGリスト: {tempNGList.totalCount}件
                {hasChanges && <span style={{ color: 'var(--warning-color)', marginLeft: '8px' }}>(未保存)</span>}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {((activeTab === 'nglist' && hasChanges) || (activeTab === 'genre-order' && hasGenreOrderChanges)) && (
              <button 
                className={styles.applyButton} 
                onClick={handleApply}
                style={{
                  padding: '8px 16px',
                  background: 'var(--primary-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                適用
              </button>
            )}
            <button className={styles.closeButton} onClick={handleClose}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}