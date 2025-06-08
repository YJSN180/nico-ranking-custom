'use client'

import { useState } from 'react'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import { useUserPreferences, type ThemeType } from '@/hooks/use-user-preferences'
import styles from './settings-modal.module.css'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'display' | 'nglist'>('nglist')
  const [inputVideoId, setInputVideoId] = useState('')
  const [inputVideoTitle, setInputVideoTitle] = useState('')
  const [videoTitleType, setVideoTitleType] = useState<'exact' | 'partial'>('partial')
  const [inputAuthorId, setInputAuthorId] = useState('')
  const [inputAuthorName, setInputAuthorName] = useState('')
  const [authorNameType, setAuthorNameType] = useState<'exact' | 'partial'>('exact')

  const {
    ngList,
    addVideoId,
    removeVideoId,
    addVideoTitle,
    removeVideoTitle,
    addAuthorId,
    removeAuthorId,
    addAuthorName,
    removeAuthorName,
  } = useUserNGList()

  const { preferences, updatePreferences } = useUserPreferences()

  if (!isOpen) return null

  const handleAddVideoId = () => {
    if (inputVideoId.trim()) {
      addVideoId(inputVideoId.trim())
      setInputVideoId('')
    }
  }

  const handleAddVideoTitle = () => {
    if (inputVideoTitle.trim()) {
      addVideoTitle(inputVideoTitle.trim(), videoTitleType)
      setInputVideoTitle('')
    }
  }

  const handleAddAuthorId = () => {
    if (inputAuthorId.trim()) {
      addAuthorId(inputAuthorId.trim())
      setInputAuthorId('')
    }
  }

  const handleAddAuthorName = () => {
    if (inputAuthorName.trim()) {
      addAuthorName(inputAuthorName.trim(), authorNameType)
      setInputAuthorName('')
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
            表示設定
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'nglist' ? styles.active : ''}`}
            onClick={() => setActiveTab('nglist')}
          >
            NGリスト管理
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === 'display' ? (
            <div className={styles.displaySettings}>
              <section className={styles.section}>
                <h3>🎨 テーマ設定</h3>
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '12px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="light"
                      checked={preferences.theme === 'light'}
                      onChange={() => updatePreferences({ theme: 'light' })}
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
                      onChange={() => updatePreferences({ theme: 'dark' })}
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
                      onChange={() => updatePreferences({ theme: 'darkblue' })}
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
              </section>
            </div>
          ) : (
            <div className={styles.ngListSettings}>
              {/* 動画ID */}
              <section className={styles.section}>
                <h3>🚫 動画ID</h3>
                <div className={styles.list}>
                  {ngList.videoIds.map((id) => (
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
                  {ngList.videoTitles.exact.map((title) => (
                    <div key={title} className={styles.listItem}>
                      <span>{title} (完全)</span>
                      <button onClick={() => removeVideoTitle(title, 'exact')}>×</button>
                    </div>
                  ))}
                  {ngList.videoTitles.partial.map((title) => (
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
                    {ngList.authorIds.map((id) => (
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
                    {ngList.authorNames.exact.map((name) => (
                      <div key={name} className={styles.listItem}>
                        <span>名前: {name} (完全)</span>
                        <button onClick={() => removeAuthorName(name, 'exact')}>×</button>
                      </div>
                    ))}
                    {ngList.authorNames.partial.map((name) => (
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
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.stats}>
            NGリスト: {ngList.totalCount}件
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}