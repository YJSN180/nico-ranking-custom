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
  const [successMessage, setSuccessMessage] = useState('✓ コピーしました')
  const longPressTimer = useRef<NodeJS.Timeout>()
  const containerRef = useRef<HTMLDivElement>(null)

  // 動画URLを生成
  const videoUrl = `https://www.nicovideo.jp/watch/${video.id}`
  const shareTitle = `${video.title} - ニコニコ動画`

  // 長押し開始
  const handleTouchStart = (e: React.TouchEvent) => {
    // インタラクティブな要素（ボタン、リンクなど）からのタッチは無視
    const target = e.target as HTMLElement
    const interactiveElement = target.closest(
      'button, a, input, textarea, select, [role="button"], [tabindex]',
    )

    // インタラクティブ要素からのタッチイベントは長押し検出しない
    if (interactiveElement) {
      return
    }

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

    // インタラクティブな要素からの右クリックは無視
    const target = e.target as HTMLElement
    const interactiveElement = target.closest(
      'button, a, input, textarea, select, [role="button"], [tabindex]',
    )

    if (interactiveElement) {
      return
    }

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
          url: videoUrl,
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

  // サムネイル保存機能
  const handleSaveThumbnail = async () => {
    try {
      // HDサムネイルエンドポイントから1280x720の高解像度サムネイルを取得
      // eslint-disable-next-line no-console
      console.log(`[HD Thumbnail] Fetching HD thumbnail for ${video.id}`)

      const response = await fetch(`/api/hd-thumbnail/${video.id}`)

      if (!response.ok) {
        throw new Error(`HDサムネイル取得に失敗しました: ${response.status}`)
      }

      const data = await response.json()
      const thumbnailUrl = data.thumbnail

      if (!thumbnailUrl) {
        throw new Error('HDサムネイルが見つかりません')
      }

      // eslint-disable-next-line no-console
      console.log(
        `[HD Thumbnail] Resolution: ${data.resolution}, URL: ${thumbnailUrl}`,
      )

      // プロキシAPIが利用可能か試す
      try {
        const proxyResponse = await fetch(
          `/api/thumbnail-proxy?url=${encodeURIComponent(thumbnailUrl)}`,
        )

        if (proxyResponse.ok) {
          // プロキシ経由でダウンロード
          const blob = await proxyResponse.blob()
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `${video.id}.jpg`

          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)

          URL.revokeObjectURL(url)

          // 成功メッセージを表示
          setSuccessMessage('✓ サムネイルを保存しました')
          setCopySuccess(true)
          setTimeout(() => {
            closeMenu()
          }, 1500)
          return
        }
      } catch (proxyError) {
        // プロキシAPIが使えない場合は、フォールバック処理へ
      }

      // フォールバック: 新しいタブで画像を開く
      window.open(thumbnailUrl, '_blank')

      // 手動保存の案内メッセージ
      setSuccessMessage('✓ 画像を開きました\n右クリックで保存してください')
      setCopySuccess(true)
      setTimeout(() => {
        closeMenu()
      }, 2500)
    } catch (error) {
      console.error('サムネイル保存エラー:', error)
      alert('サムネイルの取得に失敗しました')
    }
  }

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        showMenu &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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
          <div
            className="video-context-menu-overlay"
            onClick={closeMenu}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                closeMenu()
              }
            }}
          />

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
                {successMessage}
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

                <div className="video-context-menu__divider" />

                <button
                  className="video-context-menu__item"
                  onClick={handleSaveThumbnail}
                >
                  <span className="video-context-menu__icon">🖼️</span>
                  サムネイル保存
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
