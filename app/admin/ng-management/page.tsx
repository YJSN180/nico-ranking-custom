'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/hooks/use-theme'
import styles from './ng-management.module.css'

interface NGList {
  videoIds: string[]
  authorIds: string[]
  videoTitles: string[]
  authorNames: string[]
}

interface DerivedNGList {
  videoIds: string[]
  count: number
  lastUpdated?: string
}

export default function NGManagementPage() {
  const { theme } = useTheme()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [manualList, setManualList] = useState<NGList>({
    videoIds: [],
    authorIds: [],
    videoTitles: [],
    authorNames: []
  })
  const [derivedList, setDerivedList] = useState<DerivedNGList>({
    videoIds: [],
    count: 0
  })
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'manual' | 'derived'>('manual')
  const [loading, setLoading] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [itemType, setItemType] = useState<keyof NGList>('videoIds')

  useEffect(() => {
    // Check authentication
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/ng-list')
        if (response.ok) {
          setIsAuthenticated(true)
          fetchNGLists()
        }
      } catch (error) {
        // Not authenticated
      }
    }
    checkAuth()
  }, [])

  const fetchNGLists = async () => {
    setLoading(true)
    try {
      const [manualRes, derivedRes] = await Promise.all([
        fetch('/api/admin/ng-list'),
        fetch('/api/admin/ng-list/derived')
      ])
      
      if (manualRes.ok) {
        const data = await manualRes.json()
        setManualList(data)
      }
      
      if (derivedRes.ok) {
        const data = await derivedRes.json()
        setDerivedList({
          videoIds: data.videoIds || [],
          count: data.videoIds?.length || 0,
          lastUpdated: data.lastUpdated
        })
      }
    } catch (error) {
      console.error('Failed to fetch NG lists:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddItem = async () => {
    if (!newItem.trim()) return

    const updatedList = {
      ...manualList,
      [itemType]: [...manualList[itemType], newItem.trim()]
    }

    try {
      const response = await fetch('/api/admin/ng-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedList)
      })

      if (response.ok) {
        setManualList(updatedList)
        setNewItem('')
      }
    } catch (error) {
      alert('追加に失敗しました')
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return
    if (!confirm(`${selectedItems.size}件のアイテムを削除しますか？`)) return

    const updatedList = { ...manualList }
    
    // Remove selected items from all categories
    Object.keys(updatedList).forEach(key => {
      const k = key as keyof NGList
      updatedList[k] = updatedList[k].filter(item => !selectedItems.has(`${k}-${item}`))
    })

    try {
      const response = await fetch('/api/admin/ng-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedList)
      })

      if (response.ok) {
        setManualList(updatedList)
        setSelectedItems(new Set())
      }
    } catch (error) {
      alert('削除に失敗しました')
    }
  }

  const handleClearDerived = async () => {
    if (!confirm('派生NGリストをクリアしますか？')) return

    try {
      const response = await fetch('/api/admin/ng-list/derived', {
        method: 'DELETE'
      })

      if (response.ok) {
        setDerivedList({ videoIds: [], count: 0 })
      }
    } catch (error) {
      alert('クリアに失敗しました')
    }
  }

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedItems(newSelected)
  }

  if (!isAuthenticated) {
    return (
      <div className={`${styles.container} ${styles[theme]}`}>
        <h1>認証が必要です</h1>
        <p>管理者としてログインしてください。</p>
      </div>
    )
  }

  return (
    <div className={`${styles.container} ${styles[theme]}`}>
      <h1>NGリスト管理</h1>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'manual' ? styles.active : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          手動NGリスト
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'derived' ? styles.active : ''}`}
          onClick={() => setActiveTab('derived')}
        >
          派生NGリスト ({derivedList.count}件)
        </button>
      </div>

      {activeTab === 'manual' && (
        <div className={styles.content}>
          <div className={styles.addSection}>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value as keyof NGList)}
              className={styles.select}
            >
              <option value="videoIds">動画ID</option>
              <option value="authorIds">投稿者ID</option>
              <option value="videoTitles">動画タイトル</option>
              <option value="authorNames">投稿者名</option>
            </select>
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder={`新しい${
                itemType === 'videoIds' ? '動画ID' :
                itemType === 'authorIds' ? '投稿者ID' :
                itemType === 'videoTitles' ? '動画タイトル' :
                '投稿者名'
              }を追加`}
              className={styles.input}
            />
            <button onClick={handleAddItem} className={styles.addButton}>
              追加
            </button>
          </div>

          {selectedItems.size > 0 && (
            <div className={styles.actionBar}>
              <span>{selectedItems.size}件選択中</span>
              <button onClick={handleDeleteSelected} className={styles.deleteButton}>
                選択したアイテムを削除
              </button>
            </div>
          )}

          <div className={styles.listSections}>
            {Object.entries(manualList).map(([key, items]) => (
              <div key={key} className={styles.section}>
                <h3>
                  {key === 'videoIds' ? '動画ID' :
                   key === 'authorIds' ? '投稿者ID' :
                   key === 'videoTitles' ? '動画タイトル' :
                   '投稿者名'} ({items.length}件)
                </h3>
                <div className={styles.itemList}>
                  {items.map((item) => (
                    <div key={`${key}-${item}`} className={styles.item}>
                      <input
                        type="checkbox"
                        checked={selectedItems.has(`${key}-${item}`)}
                        onChange={() => toggleSelection(`${key}-${item}`)}
                      />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'derived' && (
        <div className={styles.content}>
          <div className={styles.derivedInfo}>
            <p>派生NGリストは、NGに設定された投稿者の他の動画を自動的にブロックします。</p>
            {derivedList.lastUpdated && (
              <p>最終更新: {new Date(derivedList.lastUpdated).toLocaleString('ja-JP')}</p>
            )}
            <button onClick={handleClearDerived} className={styles.clearButton}>
              派生リストをクリア
            </button>
          </div>
          
          <div className={styles.derivedList}>
            <h3>ブロックされた動画ID一覧</h3>
            <div className={styles.scrollableList}>
              {derivedList.videoIds.map((id) => (
                <div key={id} className={styles.derivedItem}>
                  {id}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}