'use client'

import { useState, useEffect } from 'react'
import type { NGList } from '@/types/ng-list'

export default function NGSettingsPage() {
  const [ngList, setNgList] = useState<NGList>({
    videoIds: [],
    videoTitles: [],
    authorIds: [],
    authorNames: [],
    derivedVideoIds: []
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // 入力フィールド用の状態
  const [newVideoId, setNewVideoId] = useState('')
  const [newVideoTitle, setNewVideoTitle] = useState('')
  const [newAuthorId, setNewAuthorId] = useState('')
  const [newAuthorName, setNewAuthorName] = useState('')

  // NGリストを取得
  useEffect(() => {
    fetchNGList()
  }, [])

  const fetchNGList = async () => {
    try {
      const response = await fetch('/api/admin/ng-list')
      if (response.ok) {
        const data = await response.json()
        setNgList(data)
      }
    } catch (error) {
      // エラーハンドリング
    } finally {
      setLoading(false)
    }
  }

  // NGリストを保存
  const saveNGList = async () => {
    setSaving(true)
    try {
      await fetch('/api/admin/ng-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoIds: ngList.videoIds,
          videoTitles: ngList.videoTitles,
          authorIds: ngList.authorIds,
          authorNames: ngList.authorNames
        })
      })
      alert('保存しました')
    } catch (error) {
      alert('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // アイテムを追加
  const addItem = (type: keyof Omit<NGList, 'derivedVideoIds'>, value: string) => {
    if (!value.trim()) return
    
    setNgList(prev => ({
      ...prev,
      [type]: [...prev[type], value.trim()]
    }))
    
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
  const removeItem = (type: keyof Omit<NGList, 'derivedVideoIds'>, index: number) => {
    setNgList((prev: NGList) => ({
      ...prev,
      [type]: prev[type].filter((_: string, i: number) => i !== index)
    }))
  }

  // 派生NGリストをクリア
  const clearDerivedList = async () => {
    if (!confirm('派生NGリストをすべてクリアしますか？')) return
    
    try {
      await fetch('/api/admin/ng-list/clear-derived', { method: 'POST' })
      setNgList((prev: NGList) => ({ ...prev, derivedVideoIds: [] }))
      alert('クリアしました')
    } catch (error) {
      alert('クリアに失敗しました')
    }
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>読み込み中...</div>
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ marginBottom: '30px' }}>NG設定管理</h1>
      
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
          <h3>動画タイトル（完全一致）</h3>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              value={newVideoTitle}
              onChange={(e) => setNewVideoTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addItem('videoTitles', newVideoTitle)}
              placeholder="完全一致するタイトル"
              style={{ flex: 1, padding: '8px' }}
            />
            <button onClick={() => addItem('videoTitles', newVideoTitle)}>追加</button>
          </div>
          <ul>
            {ngList.videoTitles.map((title, index) => (
              <li key={index} style={{ marginBottom: '5px' }}>
                {title}
                <button onClick={() => removeItem('videoTitles', index)} style={{ marginLeft: '10px' }}>削除</button>
              </li>
            ))}
          </ul>
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
          <h3>投稿者名（完全一致）</h3>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              value={newAuthorName}
              onChange={(e) => setNewAuthorName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addItem('authorNames', newAuthorName)}
              placeholder="例: 蠍媛"
              style={{ flex: 1, padding: '8px' }}
            />
            <button onClick={() => addItem('authorNames', newAuthorName)}>追加</button>
          </div>
          <ul>
            {ngList.authorNames.map((name, index) => (
              <li key={index} style={{ marginBottom: '5px' }}>
                {name}
                <button onClick={() => removeItem('authorNames', index)} style={{ marginLeft: '10px' }}>削除</button>
              </li>
            ))}
          </ul>
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
          他の条件でNGされた動画IDが自動的に追加されます。
        </p>
        <p style={{ marginBottom: '20px' }}>
          登録数: {ngList.derivedVideoIds.length}件
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
        
        {ngList.derivedVideoIds.length > 0 && (
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