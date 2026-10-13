'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { NGList } from '@/types/ng-list'
import { createEmptyNGList, migrateLegacyNGList } from '@/lib/ng-list-migration'
import { DerivedNGList } from './components/DerivedNGList'
import { AutoNGPanel } from './components/AutoNGPanel'
import { captureWebException } from '@/lib/sentry/capture'

// 常時ライトモード適用のためのラッパー
function LightModeWrapper({ children }: { children: React.ReactNode }) {
  const previousThemeRef = useRef<string | null>(null)

  useEffect(() => {
    // body要素に強制的にライトテーマを適用
    previousThemeRef.current = document.body.getAttribute('data-theme')
    document.body.setAttribute('data-theme', 'light')
    
    return () => {
      // クリーンアップ時にテーマ属性を削除（元の設定に戻す）
      const previousTheme = previousThemeRef.current
      if (previousTheme === null) {
        document.body.removeAttribute('data-theme')
      } else {
        document.body.setAttribute('data-theme', previousTheme)
      }
    }
  }, [])
  
  return <div data-theme="light" style={{ minHeight: '100vh', backgroundColor: '#ffffff', color: '#333333' }}>{children}</div>
}

export default function NGSettingsPage() {
  const [ngList, setNgList] = useState<NGList>(createEmptyNGList())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // 一覧を取得できたか。取得に失敗しているあいだは、空（または古い）一覧から保存しないよう編集と保存を止める
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const editable = loaded && loadError === null
  
  // AbortController用のref
  const fetchAbortControllerRef = useRef<AbortController | null>(null)
  const saveAbortControllerRef = useRef<AbortController | null>(null)
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressAutoSaveRef = useRef(false)
  
  // 入力フィールド用の状態
  const [newVideoId, setNewVideoId] = useState('')
  const [newVideoTitle, setNewVideoTitle] = useState('')
  const [videoTitleMatchType, setVideoTitleMatchType] = useState<'exact' | 'partial'>('exact')
  const [newAuthorId, setNewAuthorId] = useState('')
  const [bulkAuthorIds, setBulkAuthorIds] = useState('')
  const [newAuthorName, setNewAuthorName] = useState('')
  const [authorNameMatchType, setAuthorNameMatchType] = useState<'exact' | 'partial'>('exact')

  const fetchNGList = useCallback(async () => {
    // 前のリクエストをキャンセル
    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort()
    }
    
    // 新しいAbortControllerを作成
    const controller = new AbortController()
    fetchAbortControllerRef.current = controller
    
    try {
      const response = await fetch('/api/admin/ng-list', {
        credentials: 'same-origin',
        signal: controller.signal
      })
      if (!response.ok) {
        captureWebException(new Error(`NG list load failed: ${response.status}`), {
          tags: {
            runtime: 'browser',
            surface: 'admin-ng-settings',
            endpoint_family: '/api/admin/ng-list',
            action: 'load',
          },
          contexts: {
            request: {
              status: response.status,
            },
          },
        })
        console.error('Failed to fetch NG list:', response.status, response.statusText)
        setLoadError(`手動NGリストを読み込めませんでした (${response.status})`)
        if (response.status === 401) {
          alert('認証エラー: ページをリロードして再度ログインしてください')
        }
      } else {
        const data = await response.json()
        // マイグレーション処理を適用
        const migrated = migrateLegacyNGList(data)
        suppressAutoSaveRef.current = true
        setNgList(migrated)
        setLoaded(true)
        setLoadError(null)
      }
    } catch (error: any) {
      // AbortErrorは無視
      if (error.name === 'AbortError') {
        return
      }
      captureWebException(error, {
        tags: {
          runtime: 'browser',
          surface: 'admin-ng-settings',
          endpoint_family: '/api/admin/ng-list',
          action: 'load',
        },
      })
      console.error('Error fetching NG list:', error)
      setLoadError('手動NGリストを読み込めませんでした')
      alert('NGリストの取得に失敗しました')
    } finally {
      // AbortErrorの場合はローディング状態を維持
      if (controller.signal.aborted !== true) {
        setLoading(false)
      }
    }
  }, [])

  // NGリストを取得
  useEffect(() => {
    fetchNGList()
    
    // クリーンアップ
    return () => {
      if (fetchAbortControllerRef.current) {
        fetchAbortControllerRef.current.abort()
      }
      if (saveAbortControllerRef.current) {
        saveAbortControllerRef.current.abort()
      }
    }
  }, [fetchNGList])

  // NGリストを保存
  const saveNGList = useCallback(async () => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = null
    }
    // 取得に失敗した（空または古い）一覧は保存しない
    if (!editable) return
    // 前のリクエストをキャンセル
    if (saveAbortControllerRef.current) {
      saveAbortControllerRef.current.abort()
    }
    
    // 新しいAbortControllerを作成
    const controller = new AbortController()
    saveAbortControllerRef.current = controller
    
    setSaving(true)
    
    try {
      const response = await fetch('/api/admin/ng-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
        body: JSON.stringify({
          videoIds: ngList.videoIds,
          videoTitles: ngList.videoTitles,
          authorIds: ngList.authorIds,
          authorNames: ngList.authorNames
        })
      })
      if (!response.ok) {
        captureWebException(new Error(`NG list save failed: ${response.status}`), {
          tags: {
            runtime: 'browser',
            surface: 'admin-ng-settings',
            endpoint_family: '/api/admin/ng-list',
            action: 'save',
          },
          contexts: {
            ng_list: {
              videoIdCount: ngList.videoIds.length,
              authorIdCount: ngList.authorIds.length,
              videoTitleCount: ngList.videoTitles.exact.length + ngList.videoTitles.partial.length,
              authorNameCount: ngList.authorNames.exact.length + ngList.authorNames.partial.length,
            },
            request: {
              status: response.status,
            },
          },
        })
        console.error('Failed to save NG list:', response.status, response.statusText)
        if (response.status === 401) {
          alert('認証エラー: ページをリロードして再度ログインしてください')
        } else {
          alert('保存に失敗しました')
        }
      } else {
        alert('保存しました')
        // 保存後に再取得して最新の状態を反映
        await fetchNGList()
      }
    } catch (error: any) {
      // AbortErrorは無視
      if (error.name === 'AbortError') {
        return
      }
      captureWebException(error, {
        tags: {
          runtime: 'browser',
          surface: 'admin-ng-settings',
          endpoint_family: '/api/admin/ng-list',
          action: 'save',
        },
        contexts: {
          ng_list: {
            videoIdCount: ngList.videoIds.length,
            authorIdCount: ngList.authorIds.length,
            videoTitleCount: ngList.videoTitles.exact.length + ngList.videoTitles.partial.length,
            authorNameCount: ngList.authorNames.exact.length + ngList.authorNames.partial.length,
          },
        },
      })
      console.error('Error saving NG list:', error)
      alert('保存に失敗しました')
  } finally {
      // AbortErrorの場合は保存中状態を維持
      if (controller.signal.aborted !== true) {
        setSaving(false)
      }
    }
  }, [ngList, fetchNGList, editable])

  useEffect(() => {
    if (loading || saving || !editable) return
    if (suppressAutoSaveRef.current) {
      suppressAutoSaveRef.current = false
      return
    }
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      saveNGList()
    }, 700)
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [ngList, loading, saving, editable, saveNGList])

  // アイテムを追加
  const addItem = (type: keyof Omit<NGList, 'derivedVideoIds'>, value: string, matchType?: 'exact' | 'partial') => {
    if (!editable || !value.trim()) return

    const trimmedValue = value.trim()
    const isDuplicate = (() => {
      switch (type) {
        case 'videoIds':
          return ngList.videoIds.includes(trimmedValue)
        case 'authorIds':
          return ngList.authorIds.includes(trimmedValue)
        case 'videoTitles':
          return ngList.videoTitles.exact.includes(trimmedValue) || ngList.videoTitles.partial.includes(trimmedValue)
        case 'authorNames':
          return ngList.authorNames.exact.includes(trimmedValue) || ngList.authorNames.partial.includes(trimmedValue)
        default:
          return false
      }
    })()

    if (isDuplicate) {
      alert(`すでに登録済みです: ${trimmedValue}`)
      return
    }

    setNgList(prev => {
      switch (type) {
        case 'videoIds':
        case 'authorIds':
          return {
            ...prev,
            [type]: [...prev[type], trimmedValue]
          }
        case 'videoTitles':
        case 'authorNames':
          const subType = matchType || 'exact'
          return {
            ...prev,
            [type]: {
              ...prev[type],
              [subType]: [...prev[type][subType], trimmedValue]
            }
          }
        default:
          return prev
      }
    })
    
    // 入力フィールドをクリア
    switch (type) {
      case 'videoIds':
        setNewVideoId('')
        break
      case 'videoTitles':
        setNewVideoTitle('')
        break
      case 'authorIds':
        setNewAuthorId('')
        break
      case 'authorNames':
        setNewAuthorName('')
        break
    }
  }

  // 投稿者 ID をまとめて追加（改行・カンマ・空白区切り。重複と既登録は除く）
  const addAuthorIdsBulk = useCallback((text: string) => {
    if (!editable) return
    const ids = Array.from(new Set(text.split(/[\s,、]+/).map((s) => s.trim()).filter((s) => /^(\d{1,12}|channel\/ch\d{1,12})$/.test(s))))
    if (ids.length === 0) return
    setNgList(prev => {
      const existing = new Set(prev.authorIds)
      const added = ids.filter((id) => !existing.has(id))
      return added.length === 0 ? prev : { ...prev, authorIds: [...prev.authorIds, ...added] }
    })
    setBulkAuthorIds('')
  }, [editable])

  // アイテムを削除
  const removeItem = (type: keyof Omit<NGList, 'derivedVideoIds'>, index: number, matchType?: 'exact' | 'partial') => {
    if (!editable) return
    setNgList(prev => {
      switch (type) {
        case 'videoIds':
        case 'authorIds':
          return {
            ...prev,
            [type]: prev[type].filter((_, i) => i !== index)
          }
        case 'videoTitles':
        case 'authorNames':
          const subType = matchType || 'exact'
          return {
            ...prev,
            [type]: {
              ...prev[type],
              [subType]: prev[type][subType].filter((_, i) => i !== index)
            }
          }
        default:
          return prev
      }
    })
  }


  if (loading) {
    return (
      <LightModeWrapper>
        <div style={{ padding: '20px' }}>読み込み中...</div>
      </LightModeWrapper>
    )
  }

  return (
    <LightModeWrapper>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ marginBottom: '8px' }}>NG設定管理</h1>
      <nav aria-label="セクション" style={{ display: 'flex', gap: '14px', marginBottom: '24px', fontSize: '14px' }}>
        <a href="#auto-ng-title" style={{ color: '#2f5fd1' }}>自動NG</a>
        <a href="#manual-ng" style={{ color: '#2f5fd1' }}>手動NG</a>
        <a href="#derived-ng" style={{ color: '#2f5fd1' }}>派生NG</a>
      </nav>

      {/* 自動NG（粗悪コンテンツ） */}
      <AutoNGPanel
        manualAuthorIds={ngList.authorIds}
        onCopyToManualNG={(authorId) => addAuthorIdsBulk(authorId)}
        canCopyToManualNG={editable}
      />

      {/* 派生NGの説明 */}
      <div style={{ 
        marginBottom: '30px', 
        padding: '15px', 
        background: '#e3f2fd', 
        borderRadius: '8px', 
        border: '1px solid #90caf9' 
      }}>
        <h3 style={{ marginBottom: '10px', color: '#1976d2' }}>派生NGについて</h3>
        <p style={{ margin: '0', color: '#424242', lineHeight: '1.5' }}>
          手動NGリスト（タイトル・投稿者名）でフィルタリングされた動画のIDは、
          自動的に「派生NGリスト」に追加され、以後確実に非表示になります。
          この機能により、一度NGになった動画は動画IDが直接ブロックされるため、
          タイトル変更などでも確実に除外され続けます。
        </p>
      </div>
      
      {/* 手動NGリスト */}
      <div id="manual-ng" style={{ marginBottom: '40px' }}>
        <h2>手動NGリスト</h2>

        {loadError && (
          <div role="alert" style={{ marginBottom: '20px', padding: '12px 15px', background: '#fdecea', border: '1px solid #f5c2c7', borderRadius: '8px', color: '#842029' }}>
            <p style={{ margin: '0 0 8px' }}>
              {loadError}。空の一覧から保存して登録済みの内容を消さないよう、読み込めるまで手動NGリストの編集と保存を止めています。
            </p>
            <button type="button" onClick={() => void fetchNGList()}>再読み込み</button>
          </div>
        )}

        {/* 取得に失敗しているあいだは入力・削除・保存をまとめて無効にする（見た目は変えない） */}
        <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {/* 動画ID */}
        <section style={{ marginBottom: '30px', background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
          <h3>動画ID</h3>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              value={newVideoId}
              onChange={(e) => setNewVideoId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addItem('videoIds', newVideoId)}
              placeholder="例: sm12345"
              style={{ flex: 1, padding: '8px' }}
            />
            <button onClick={() => addItem('videoIds', newVideoId)}>追加</button>
          </div>
          <ul>
            {ngList.videoIds.map((id, index) => (
              <li key={index} style={{ marginBottom: '5px' }}>
                {id}
                <button onClick={() => removeItem('videoIds', index)} style={{ marginLeft: '10px' }}>削除</button>
              </li>
            ))}
          </ul>
        </section>

        {/* 動画タイトル */}
        <section style={{ marginBottom: '30px', background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
          <h3>動画タイトル</h3>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              value={newVideoTitle}
              onChange={(e) => setNewVideoTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addItem('videoTitles', newVideoTitle, videoTitleMatchType)}
              placeholder="NGにするタイトル"
              style={{ flex: 1, padding: '8px' }}
            />
            <select 
              value={videoTitleMatchType} 
              onChange={(e) => setVideoTitleMatchType(e.target.value as 'exact' | 'partial')}
              style={{ padding: '8px' }}
            >
              <option value="exact">完全一致</option>
              <option value="partial">部分一致</option>
            </select>
            <button onClick={() => addItem('videoTitles', newVideoTitle, videoTitleMatchType)}>追加</button>
          </div>
          
          {/* 完全一致リスト */}
          {ngList.videoTitles.exact.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <h4>完全一致</h4>
              <ul>
                {ngList.videoTitles.exact.map((title, index) => (
                  <li key={index} style={{ marginBottom: '5px' }}>
                    {title}
                    <button onClick={() => removeItem('videoTitles', index, 'exact')} style={{ marginLeft: '10px' }}>削除</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* 部分一致リスト */}
          {ngList.videoTitles.partial.length > 0 && (
            <div>
              <h4>部分一致</h4>
              <ul>
                {ngList.videoTitles.partial.map((title, index) => (
                  <li key={index} style={{ marginBottom: '5px' }}>
                    {title}
                    <button onClick={() => removeItem('videoTitles', index, 'partial')} style={{ marginLeft: '10px' }}>削除</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 投稿者ID */}
        <section style={{ marginBottom: '30px', background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
          <h3>投稿者ID</h3>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              value={newAuthorId}
              onChange={(e) => setNewAuthorId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addItem('authorIds', newAuthorId)}
              placeholder="投稿者のID"
              style={{ flex: 1, padding: '8px' }}
            />
            <button onClick={() => addItem('authorIds', newAuthorId)}>追加</button>
          </div>
          <details style={{ marginBottom: '10px' }}>
            <summary style={{ cursor: 'pointer' }}>複数の投稿者IDをまとめて追加</summary>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <textarea
                value={bulkAuthorIds}
                onChange={(e) => setBulkAuthorIds(e.target.value)}
                placeholder={'1 行に 1 つ、またはカンマ区切り\n例: 12345678\nchannel/ch1234'}
                aria-label="投稿者IDの一括追加"
                style={{ flex: 1, padding: '8px', minHeight: '80px' }}
              />
              <button onClick={() => addAuthorIdsBulk(bulkAuthorIds)} disabled={!bulkAuthorIds.trim()}>まとめて追加</button>
            </div>
          </details>
          <ul>
            {ngList.authorIds.map((id, index) => (
              <li key={index} style={{ marginBottom: '5px' }}>
                {id}
                <button onClick={() => removeItem('authorIds', index)} style={{ marginLeft: '10px' }}>削除</button>
              </li>
            ))}
          </ul>
        </section>

        {/* 投稿者名 */}
        <section style={{ marginBottom: '30px', background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
          <h3>投稿者名</h3>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              value={newAuthorName}
              onChange={(e) => setNewAuthorName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addItem('authorNames', newAuthorName, authorNameMatchType)}
              placeholder="NGにする投稿者名"
              style={{ flex: 1, padding: '8px' }}
            />
            <select 
              value={authorNameMatchType} 
              onChange={(e) => setAuthorNameMatchType(e.target.value as 'exact' | 'partial')}
              style={{ padding: '8px' }}
            >
              <option value="exact">完全一致</option>
              <option value="partial">部分一致</option>
            </select>
            <button onClick={() => addItem('authorNames', newAuthorName, authorNameMatchType)}>追加</button>
          </div>
          
          {/* 完全一致リスト */}
          {ngList.authorNames.exact.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <h4>完全一致</h4>
              <ul>
                {ngList.authorNames.exact.map((name, index) => (
                  <li key={index} style={{ marginBottom: '5px' }}>
                    {name}
                    <button onClick={() => removeItem('authorNames', index, 'exact')} style={{ marginLeft: '10px' }}>削除</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* 部分一致リスト */}
          {ngList.authorNames.partial.length > 0 && (
            <div>
              <h4>部分一致</h4>
              <ul>
                {ngList.authorNames.partial.map((name, index) => (
                  <li key={index} style={{ marginBottom: '5px' }}>
                    {name}
                    <button onClick={() => removeItem('authorNames', index, 'partial')} style={{ marginLeft: '10px' }}>削除</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <button 
          onClick={saveNGList} 
          disabled={saving || !editable}
          style={{ 
            padding: '10px 20px', 
            fontSize: '16px', 
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: saving || !editable ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? '保存中...' : '設定を保存'}
        </button>
        </fieldset>
      </div>

      {/* 派生NGリスト */}
      <div id="derived-ng" />
      <DerivedNGList
        initialData={ngList.derivedVideoIds || []}
        onUpdate={(newList) => {
          setNgList(prev => ({ ...prev, derivedVideoIds: newList }))
        }}
      />
      </div>
    </LightModeWrapper>
  )
}
