'use client'

import { useState, useEffect } from 'react'

interface UpdateStatus {
  lastUpdate?: {
    updatedAt: string
    isRealData: boolean
    itemCount: number
    fetchError?: string
  }
  currentDataCount: number
}

export default function AdminPage() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [updating, setUpdating] = useState(false)
  const [adminKey, setAdminKey] = useState('')
  const [updateResult, setUpdateResult] = useState<any>(null)

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/admin/update')
      const data = await response.json()
      setStatus(data)
    } catch (error) {
      // Failed to fetch status
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const handleUpdate = async () => {
    if (!adminKey) {
      alert('管理者キーを入力してください')
      return
    }

    setUpdating(true)
    setUpdateResult(null)

    try {
      const response = await fetch(`/api/admin/update?key=${adminKey}`, {
        method: 'POST',
      })
      const data = await response.json()
      
      if (response.ok) {
        setUpdateResult(data)
        await fetchStatus()
      } else {
        alert(`エラー: ${data.error}`)
      }
    } catch (error) {
      alert('更新中にエラーが発生しました')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>ランキング管理画面</h1>
      
      <div style={{ 
        backgroundColor: '#f8f9fa', 
        border: '1px solid #dee2e6', 
        borderRadius: '4px', 
        padding: '20px',
        marginBottom: '20px'
      }}>
        <h2>現在の状態</h2>
        {status && (
          <>
            <p>データ件数: {status.currentDataCount}件</p>
            {status.lastUpdate?.updatedAt && (
              <>
                <p>最終更新: {new Date(status.lastUpdate.updatedAt).toLocaleString('ja-JP')}</p>
                <p>データソース: {status.lastUpdate.isRealData ? '実際のRSS' : 'モックデータ'}</p>
                {status.lastUpdate.fetchError && (
                  <p style={{ color: '#dc3545' }}>取得エラー: {status.lastUpdate.fetchError}</p>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div style={{ 
        backgroundColor: '#f8f9fa', 
        border: '1px solid #dee2e6', 
        borderRadius: '4px', 
        padding: '20px',
        marginBottom: '20px'
      }}>
        <h2>手動更新</h2>
        <input
          type="password"
          placeholder="管理者キー"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          style={{ 
            padding: '8px', 
            marginRight: '10px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            width: '200px'
          }}
        />
        <button
          onClick={handleUpdate}
          disabled={updating}
          style={{ 
            padding: '8px 16px',
            backgroundColor: updating ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: updating ? 'not-allowed' : 'pointer'
          }}
        >
          {updating ? '更新中...' : '今すぐ更新'}
        </button>
      </div>

      {updateResult && (
        <div style={{ 
          backgroundColor: updateResult.success ? '#d4edda' : '#f8d7da', 
          border: `1px solid ${updateResult.success ? '#c3e6cb' : '#f5c6cb'}`, 
          borderRadius: '4px', 
          padding: '20px',
          marginBottom: '20px'
        }}>
          <h3>{updateResult.success ? '更新成功' : '更新失敗'}</h3>
          <p>データソース: {updateResult.isRealData ? '実際のRSS' : 'モックデータ'}</p>
          <p>取得件数: {updateResult.itemCount}件</p>
          {updateResult.fetchError && (
            <p>取得エラー: {updateResult.fetchError}</p>
          )}
          {updateResult.sampleItems && (
            <>
              <h4>サンプル（上位3件）:</h4>
              <ul>
                {updateResult.sampleItems.map((item: any) => (
                  <li key={item.id}>
                    {item.rank}位: {item.title} ({item.id})
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: '40px', fontSize: '14px', color: '#6c757d' }}>
        <p>※ Vercelのcron設定により1時間ごとに自動更新されます</p>
      </div>

      <div style={{ 
        marginTop: '20px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '4px'
      }}>
        <h2>管理機能</h2>
        <a href="/admin/ng-management" style={{
          display: 'inline-block',
          padding: '10px 20px',
          backgroundColor: '#28a745',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px',
          marginTop: '10px'
        }}>
          NGリスト管理画面へ
        </a>
      </div>
    </main>
  )
}