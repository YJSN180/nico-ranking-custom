'use client'

import { useState, useRef, useEffect } from 'react'
import type { RankingItem } from '@/types/ranking'
import './video-context-menu.css'

interface VideoContextMenuProps {
  video: RankingItem
  children: React.ReactNode
}

export function VideoContextMenu({ video, children }: VideoContextMenuProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const [copySuccess, setCopySuccess] = useState(false)
  const longPressTimer = useRef<NodeJS.Timeout>()
  const containerRef = useRef<HTMLDivElement>(null)
  
  // 動画URLを生成
  const videoUrl = `https://www.nicovideo.jp/watch/${video.id}`
  const shareTitle = `${video.title} - ニコニコ動画`
  
  // 長押し開始
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    setMenuPosition({ x: touch.clientX, y: touch.clientY })
    
    // 500ms後にメニュー表示
    longPressTimer.current = setTimeout(() => {
      // 触覚フィードバック（対応デバイスのみ）
      if ('vibrate' in navigator) {
        navigator.vibrate(50)
      }
      setShowMenu(true)
    }, 500)
  }
  
  // タッチ終了またはキャンセル
  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
    }
  }
  
  // デスクトップ右クリック対応
  const handleContextMenu = (e: React.MouseEvent) => {
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
  const copyToClipboard = async (text: string, type: 'title' | 'url') => {
    try {
      await navigator.clipboard.writeText(text)
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
        setCopySuccess(true)
        setTimeout(closeMenu, 1500)
      } catch {
        alert('コピーに失敗しました')
      }
      document.body.removeChild(textArea)
    }
  }
  
  // 共有機能
  const handleShare = async () => {
    // Web Share API が利用可能かチェック
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: video.title,
          url: videoUrl
        })
        closeMenu()
      } catch (err) {
        // ユーザーがキャンセルした場合は何もしない
        if ((err as Error).name !== 'AbortError') {
          console.error('共有エラー:', err)
        }
      }
    } else {
      // Web Share API が使えない場合はURLをコピー
      await copyToClipboard(videoUrl, 'url')
    }
  }
  
  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (showMenu && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [showMenu])
  
  return (
    <div ref={containerRef} className="video-context-menu-container">
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd} // 移動したらキャンセル
        onContextMenu={handleContextMenu}
      >
        {children}
      </div>
      
      {showMenu && (
        <>
          {/* 背景オーバーレイ */}
          <div className="video-context-menu-overlay" onClick={closeMenu} />
          
          {/* コンテキストメニュー */}
          <div 
            className="video-context-menu"
            style={{
              top: `${menuPosition.y}px`,
              left: `${menuPosition.x}px`,
            }}
          >
            {copySuccess ? (
              <div className="video-context-menu__success">
                ✓ コピーしました
              </div>
            ) : (
              <>
                <button
                  className="video-context-menu__item"
                  onClick={() => copyToClipboard(video.title, 'title')}
                >
                  <span className="video-context-menu__icon">📋</span>
                  タイトルをコピー
                </button>
                
                <button
                  className="video-context-menu__item"
                  onClick={() => copyToClipboard(videoUrl, 'url')}
                >
                  <span className="video-context-menu__icon">🔗</span>
                  URLをコピー
                </button>
                
                <div className="video-context-menu__divider" />
                
                <button
                  className="video-context-menu__item"
                  onClick={handleShare}
                >
                  <span className="video-context-menu__icon">📤</span>
                  共有...
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}