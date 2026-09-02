'use client'

import { showToast } from '@/lib/toast'
import { useState, useRef } from 'react'
import type { TagDetail } from '@/types/ranking'
import type { ExtendedUserNGList } from '@/types/ng-list-extended'
import './tag-context-menu.css'

interface TagContextMenuProps {
  tagDetail: TagDetail
  children: React.ReactNode
  ngList: ExtendedUserNGList
  saveNGListDirectly: (list: ExtendedUserNGList) => void
  onNGAdded?: (tagName: string, withAttribute: boolean) => void
}

export function TagContextMenu({ tagDetail, children, ngList, saveNGListDirectly, onNGAdded }: TagContextMenuProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const [copySuccess, setCopySuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState('✓ コピーしました')
  const containerRef = useRef<HTMLDivElement>(null)
  
  // シンプルクリックでメニュー表示
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    setMenuPosition({ x: e.clientX, y: e.clientY })
    setShowMenu(true)
  }
  
  // メニューを閉じる
  const closeMenu = () => {
    setShowMenu(false)
    setCopySuccess(false)
  }
  
  // クリップボードにコピー
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSuccessMessage('✓ コピーしました')
      setCopySuccess(true)
      
      // 2秒後にメニューを閉じる
      setTimeout(() => {
        closeMenu()
      }, 1500)
    } catch (err) {
      console.error('コピーに失敗しました:', err)
      // フォールバック: 古いブラウザ対応
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        setSuccessMessage('✓ コピーしました')
        setCopySuccess(true)
        setTimeout(closeMenu, 1500)
      } catch {
        showToast('コピーに失敗しました', 'error')
      }
      document.body.removeChild(textArea)
    }
  }
  
  // NGリストに追加（属性を考慮）
  const addToNGWithAttribute = () => {
    const updatedList = { ...ngList }
    
    // tags構造が存在しない場合は初期化
    if (!updatedList.tags) {
      updatedList.tags = {
        locked: { exact: [], partial: [] },
        user: { exact: [], partial: [] },
        both: { exact: [], partial: [] }
      }
    }
    
    // タグタイプに応じて適切な配列に追加
    const targetArray = tagDetail.isLocked 
      ? updatedList.tags.locked.exact 
      : updatedList.tags.user.exact
    
    if (!targetArray.includes(tagDetail.name)) {
      targetArray.push(tagDetail.name)
      saveNGListDirectly(updatedList)
      
      setSuccessMessage(`✓ ${tagDetail.isLocked ? 'ロックタグ' : 'ユーザータグ'}として追加しました`)
      setCopySuccess(true)
      onNGAdded?.(tagDetail.name, true)
      
      setTimeout(() => {
        closeMenu()
      }, 2000)
    } else {
      setSuccessMessage('既にNGリストに登録済みです')
      setCopySuccess(true)
      setTimeout(closeMenu, 1500)
    }
  }
  
  // NGリストに追加（属性を無視）
  const addToNGWithoutAttribute = () => {
    const updatedList = { ...ngList }
    
    // tags構造が存在しない場合は初期化
    if (!updatedList.tags) {
      updatedList.tags = {
        locked: { exact: [], partial: [] },
        user: { exact: [], partial: [] },
        both: { exact: [], partial: [] }
      }
    }
    
    // 属性を無視してboth配列に追加
    if (!updatedList.tags.both.exact.includes(tagDetail.name)) {
      updatedList.tags.both.exact.push(tagDetail.name)
      saveNGListDirectly(updatedList)
      
      setSuccessMessage('✓ タグ名として追加しました')
      setCopySuccess(true)
      onNGAdded?.(tagDetail.name, false)
      
      setTimeout(() => {
        closeMenu()
      }, 2000)
    } else {
      setSuccessMessage('既にNGリストに登録済みです')
      setCopySuccess(true)
      setTimeout(closeMenu, 1500)
    }
  }
  
  // オーバーレイクリックで閉じる（useEffect不要）
  const handleOverlayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    closeMenu()
  }

  return (
    <div ref={containerRef} className="tag-context-menu-container">
      <div
        onClick={handleClick}
        className="tag-context-menu-trigger"
      >
        {children}
      </div>
      
      {showMenu && (
        <>
          {/* 背景オーバーレイ */}
          <div className="tag-context-menu-overlay" onClick={handleOverlayClick} />
          
          {/* コンテキストメニュー */}
          <div 
            className="tag-context-menu"
            style={{
              top: `${menuPosition.y}px`,
              left: `${menuPosition.x}px`,
            }}
          >
            {copySuccess ? (
              <div className="tag-context-menu__success">
                {successMessage}
              </div>
            ) : (
              <>
                <button
                  className="tag-context-menu__item"
                  onClick={() => copyToClipboard(tagDetail.name)}
                >
                  <span className="tag-context-menu__icon">📋</span>
                  タグ名をコピー
                </button>
                
                <button
                  className="tag-context-menu__item"
                  onClick={addToNGWithAttribute}
                >
                  <span className="tag-context-menu__icon">🚫</span>
                  この{tagDetail.isLocked ? 'ロック' : 'ユーザー'}タグをNGリストに追加
                </button>
                
                <div className="tag-context-menu__divider" />
                
                <button
                  className="tag-context-menu__item"
                  onClick={addToNGWithoutAttribute}
                >
                  <span className="tag-context-menu__icon">⚫</span>
                  タグ名そのものをNGリストに追加
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}