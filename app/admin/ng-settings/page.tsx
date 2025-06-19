'use client'

import { useState, useEffect } from 'react'
import type { NGList } from '@/types/ng-list'
import { createEmptyNGList, migrateLegacyNGList } from '@/lib/ng-list-migration'

export default function NGSettingsPage() {
  const [ngList, setNgList] = useState<NGList>(createEmptyNGList())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // 入力フィールド用の状態
  const [newVideoId, setNewVideoId] = useState('')
  const [newVideoTitle, setNewVideoTitle] = useState('')
  const [videoTitleMatchType, setVideoTitleMatchType] = useState<'exact' | 'partial'>('exact')
  const [newAuthorId, setNewAuthorId] = useState('')
  const [newAuthorName, setNewAuthorName] = useState('')
  const [authorNameMatchType, setAuthorNameMatchType] = useState<'exact' | 'partial'>('exact')

  // NGリストを取得
  useEffect(() => {
    fetchNGList()
  }, [])

  const fetchNGList = async () => {
    try {
      const response = await fetch('/api/admin/ng-list', {
        credentials: 'same-origin'
      })
      if (!response.ok) {
        console.error('Failed to fetch NG list:', response.status, response.statusText)
        if (response.status === 401) {
          alert('認証エラー: ページをリロードして再度ログインしてください')
        }
      } else {
        const data = await response.json()
        // マイグレーション処理を適用
        const migrated = migrateLegacyNGList(data)
        setNgList(migrated)
      }
    } catch (error) {
      console.error('Error fetching NG list:', error)
      alert('NGリストの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // NGリストを保存
  const saveNGList = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/ng-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          videoIds: ngList.videoIds,
          videoTitles: ngList.videoTitles,
          authorIds: ngList.authorIds,
          authorNames: ngList.authorNames
        })
      })
      if (!response.ok) {
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
    } catch (error) {
      console.error('Error saving NG list:', error)
      alert('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // アイテムを追加
  const addItem = (type: keyof Omit<NGList, 'derivedVideoIds'>, value: string, matchType?: 'exact' | 'partial') => {
    if (!value.trim()) return
    
    setNgList(prev => {
      const trimmedValue = value.trim()
      
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

  // アイテムを削除
  const removeItem = (type: keyof Omit<NGList, 'derivedVideoIds'>, index: number, matchType?: 'exact' | 'partial') => {
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

  // 派生NGリストをクリア
  const clearDerivedList = async () => {
    if (!confirm('派生NGリストをすべてクリアしますか？')) return
    
    try {
      const response = await fetch('/api/admin/ng-list/derived', { 
        method: 'DELETE',
        credentials: 'same-origin'
      })
      if (!response.ok) {
        console.error('Failed to clear derived list:', response.status, response.statusText)
        if (response.status === 401) {
          alert('認証エラー: ページをリロードして再度ログインしてください')
        } else {
          alert('クリアに失敗しました')
        }
      } else {
        setNgList((prev: NGList) => ({ ...prev, derivedVideoIds: [] }))
        alert('クリアしました')
      }
    } catch (error) {
      console.error('Error clearing derived list:', error)
      alert('クリアに失敗しました')
    }
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>読み込み中...</div>
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ marginBottom: '30px' }}>NG設定管理</h1>
      
      {/* 自動NG機能の説明 */}
      <div style={{ 
        marginBottom: '30px', 
        padding: '15px', 
        background: '#e3f2fd', 
        borderRadius: '8px', 
        border: '1px solid #90caf9' 
      }}>
        <h3 style={{ marginBottom: '10px', color: '#1976d2' }}>🤖 自動NG機能について</h3>
        <p style={{ margin: '0', color: '#424242', lineHeight: '1.5' }}>
          手動NGリスト（タイトル・投稿者名）でフィルタリングされた動画のIDは、
          自動的に「派生NGリスト」に追加され、以後確実に非表示になります。
          この機能により、一度NGになった動画は動画IDが直接ブロックされるため、
          タイトル変更などでも確実に除外され続けます。
        </p>
      </div>
      
      {/* 手動NGリスト */}
      <div style={{ marginBottom: '40px' }}>
        <h2>手動NGリスト</h2>
        
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
          disabled={saving}
          style={{ 
            padding: '10px 20px', 
            fontSize: '16px', 
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? '保存中...' : '設定を保存'}
        </button>
      </div>

      {/* 派生NGリスト */}
      <div>
        <h2>派生NGリスト（自動追加）</h2>
        <p style={{ color: '#666', marginBottom: '10px' }}>
          他の条件（タイトル・投稿者名）でNGされた動画IDが自動的に追加されます。
          cron処理・動的API取得の両方で機能し、一度NGになった動画は確実に除外され続けます。
        </p>
        <p style={{ marginBottom: '20px' }}>
          登録数: {ngList.derivedVideoIds?.length || 0}件
        </p>
        <button 
          onClick={clearDerivedList}
          style={{
            padding: '10px 20px',
            background: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          すべてクリア
        </button>
        
        {ngList.derivedVideoIds && ngList.derivedVideoIds.length > 0 && (
          <details style={{ marginTop: '20px' }}>
            <summary style={{ cursor: 'pointer' }}>一覧を表示</summary>
            <ul style={{ maxHeight: '300px', overflow: 'auto', marginTop: '10px' }}>
              {ngList.derivedVideoIds.map((id, index) => (
                <li key={index}>{id}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}