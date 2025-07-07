'use client'

import { useState, useEffect } from 'react'
import { useUserNGList, type UserNGList } from '@/hooks/use-user-ng-list'
import { useUserPreferences, type ThemeType } from '@/hooks/use-user-preferences'
import { DataBackupSeparate } from './data-backup-separate'
import { GenreOrderCustomizerDnD } from './genre-order-customizer-dnd'
import styles from './settings-modal.module.css'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onApply?: () => void
}

export function SettingsModal({ isOpen, onClose, onApply }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'display' | 'nglist' | 'genre-order' | 'data-backup'>('nglist')
  const [inputVideoId, setInputVideoId] = useState('')
  const [inputVideoTitle, setInputVideoTitle] = useState('')
  const [videoTitleType, setVideoTitleType] = useState<'exact' | 'partial'>('partial')
  const [inputAuthorId, setInputAuthorId] = useState('')
  const [inputAuthorName, setInputAuthorName] = useState('')
  const [authorNameType, setAuthorNameType] = useState<'exact' | 'partial'>('exact')

  const { ngList, saveNGListDirectly } = useUserNGList()
  
  // 一時的なNGリストの状態
  const [tempNGList, setTempNGList] = useState<UserNGList>(ngList)
  const [hasChanges, setHasChanges] = useState(false)
  const [hasGenreOrderChanges, setHasGenreOrderChanges] = useState(false)
  
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
  
  // 適用処理
  const handleApply = () => {
    // NGリストを保存（即座に反映される）
    saveNGListDirectly(tempNGList)
    
    // onApplyコールバックがあれば呼び出す
    if (onApply) {
      onApply()
    }
    
    // モーダルを閉じる
    onClose()
  }
  
  // 閉じる処理
  const handleClose = () => {
    if (hasChanges || hasGenreOrderChanges) {
      if (confirm('変更を破棄してもよろしいですか？')) {
        setTempNGList(ngList)  // 元に戻す
        setHasGenreOrderChanges(false)
        onClose()
      }
    } else {
      onClose()
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>設定</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'display' ? styles.active : ''}`}
            onClick={() => setActiveTab('display')}
          >
            🎨 表示設定
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'nglist' ? styles.active : ''}`}
            onClick={() => setActiveTab('nglist')}
          >
            🚫 NGリスト管理
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'genre-order' ? styles.active : ''}`}
            onClick={() => setActiveTab('genre-order')}
          >
            🎯 ジャンル並び替え
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'data-backup' ? styles.active : ''}`}
            onClick={() => setActiveTab('data-backup')}
          >
            💾 設定データ保存
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
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                設定データは「設定データ保存」タブから保存・復元できます。
              </p>
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
                </div>
              </section>
            </div>
          ) : activeTab === 'genre-order' ? (
            <div className={styles.genreOrderSettings}>
              <section className={styles.section}>
                <h3>🎯 ジャンル並び替え</h3>
                <GenreOrderCustomizerDnD 
                  onChangesUpdate={setHasGenreOrderChanges}
                />
              </section>
            </div>
          ) : (
            <div className={styles.dataBackupSettings}>
              <section className={styles.section}>
                <h3>💾 設定データバックアップ</h3>
                <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  NGリストとジャンル並び替えの設定を個別にバックアップファイルとしてエクスポートしたり、他のデバイスからインポートできます。
                </p>
                <DataBackupSeparate />
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
            {activeTab === 'nglist' && hasChanges && (
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