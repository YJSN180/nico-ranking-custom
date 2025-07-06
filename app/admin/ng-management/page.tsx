'use client'

import { useState, useEffect, useRef } from 'react'
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
  // 管理者NG画面は常時ライトモードで表示（視認性確保のため）
  const theme = 'light'
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
  
  // AbortController refs
  const authAbortControllerRef = useRef<AbortController | null>(null)
  const fetchAbortControllerRef = useRef<AbortController | null>(null)
  const saveAbortControllerRef = useRef<AbortController | null>(null)
  const deleteAbortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Cancel previous auth check
    if (authAbortControllerRef.current) {
      authAbortControllerRef.current.abort()
    }
    
    // Create new AbortController
    const controller = new AbortController()
    authAbortControllerRef.current = controller
    
    // Check authentication
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/ng-list', {
          signal: controller.signal
        })
        if (response.ok) {
          setIsAuthenticated(true)
          fetchNGLists()
        }
      } catch (error: any) {
        // Ignore AbortError
        if (error.name !== 'AbortError') {
          // Not authenticated
        }
      }
    }
    checkAuth()
    
    // Cleanup
    return () => {
      if (authAbortControllerRef.current) {
        authAbortControllerRef.current.abort()
      }
      if (fetchAbortControllerRef.current) {
        fetchAbortControllerRef.current.abort()
      }
      if (saveAbortControllerRef.current) {
        saveAbortControllerRef.current.abort()
      }
      if (deleteAbortControllerRef.current) {
        deleteAbortControllerRef.current.abort()
      }
    }
  }, [])

  const fetchNGLists = async () => {
    // Cancel previous fetch
    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort()
    }
    
    // Create new AbortController
    const controller = new AbortController()
    fetchAbortControllerRef.current = controller
    
    setLoading(true)
    try {
      const [manualRes, derivedRes] = await Promise.all([
        fetch('/api/admin/ng-list', {
          signal: controller.signal
        }),
        fetch('/api/admin/ng-list/derived', {
          signal: controller.signal
        })
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
    } catch (error: any) {
      // Ignore AbortError
      if (error.name !== 'AbortError') {
        console.error('Failed to fetch NG lists:', error)
      }
    } finally {
      // Only update loading state if not aborted
      if (controller.signal.aborted !== true) {
        setLoading(false)
      }
    }
  }

  const handleAddItem = async () => {
    if (!newItem.trim()) return

    const updatedList = {
      ...manualList,
      [itemType]: [...manualList[itemType], newItem.trim()]
    }

    // Cancel previous save
    if (saveAbortControllerRef.current) {
      saveAbortControllerRef.current.abort()
    }
    
    // Create new AbortController
    const controller = new AbortController()
    saveAbortControllerRef.current = controller

    try {
      const response = await fetch('/api/admin/ng-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(updatedList)
      })

      if (response.ok) {
        setManualList(updatedList)
        setNewItem('')
      }
    } catch (error: any) {
      // Ignore AbortError
      if (error.name !== 'AbortError') {
        alert('追加に失敗しました')
      }
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

    // Cancel previous save
    if (saveAbortControllerRef.current) {
      saveAbortControllerRef.current.abort()
    }
    
    // Create new AbortController
    const controller = new AbortController()
    saveAbortControllerRef.current = controller

    try {
      const response = await fetch('/api/admin/ng-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(updatedList)
      })

      if (response.ok) {
        setManualList(updatedList)
        setSelectedItems(new Set())
      }
    } catch (error: any) {
      // Ignore AbortError
      if (error.name !== 'AbortError') {
        alert('削除に失敗しました')
      }
    }
  }

  const handleClearDerived = async () => {
    if (!confirm('派生NGリストをクリアしますか？')) return

    // Cancel previous delete
    if (deleteAbortControllerRef.current) {
      deleteAbortControllerRef.current.abort()
    }
    
    // Create new AbortController
    const controller = new AbortController()
    deleteAbortControllerRef.current = controller

    try {
      const response = await fetch('/api/admin/ng-list/derived', {
        method: 'DELETE',
        signal: controller.signal
      })

      if (response.ok) {
        setDerivedList({ videoIds: [], count: 0 })
      }
    } catch (error: any) {
      // Ignore AbortError
      if (error.name !== 'AbortError') {
        alert('クリアに失敗しました')
      }
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

      {/* Information box about automatic NG feature */}
      <div className={styles.infoBox}>
        <h3>🛡️ 自動NG機能について</h3>
        <p>
          手動NGリスト（タイトル・投稿者名）でフィルタリングされた動画のIDは、自動的に「派生NGリスト」に追加され、以後確実に非表示になります。この機
          能により、一度NGになった動画は動画IDが直接ブロックされたため、タイトル変更なども確実に除外され続けます。
        </p>
      </div>

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
          <div className={styles.infoBox}>
            <h3>手動NGリスト</h3>
            <p>
              手動NGリスト（タイトル・投稿者名）でフィルタリングされた動画のIDは、自動的に「派生NGリスト」に追加され、以後確実に非表示になります。この機
              能により、一度NGになった動画は動画IDが直接ブロックされたため、タイトル変更なども確実に除外され続けます。
            </p>
          </div>
          
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
                  {items.map((item: string) => (
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