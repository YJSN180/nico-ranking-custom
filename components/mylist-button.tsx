'use client'

import { useState, useEffect } from 'react'
import { useMylistOperations } from '@/context/mylist-operations-context'
import dynamic from 'next/dynamic'

// マイリスト選択モーダルは開くまで不要なので初期バンドルから外す（行ごとに描画されるボタンの共通チャンク）
const MylistModal = dynamic(() => import('./mylist-modal').then((mod) => ({ default: mod.MylistModal })), {
  ssr: false,
  loading: () => null,
})
import { showToast } from '@/lib/toast'
import type { RankingItem } from '@/types/ranking'
import './mylist-button.css'

interface MylistButtonProps {
  video: RankingItem
  /** 3点メニュー内の行として表示する（モバイル用） */
  asMenuItem?: boolean
}

export function MylistButton({ video, asMenuItem = false }: MylistButtonProps) {
  // クライアントサイド判定（useStateの初期値で処理）
  const [isClient] = useState(() => {
    if (typeof window !== 'undefined') {
      // @ts-ignore
      return window.__TEST_ENV__ || true
    }
    return false
  })
  const { mylists, isLoading, addVideoToMylist, removeVideoFromMylist, isVideoInAnyMylist, createMylist } = useMylistOperations()
  const [isInMylist, setIsInMylist] = useState(false)
  const [mylistIds, setMylistIds] = useState<string[]>([])
  const [checkError, setCheckError] = useState<Error | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const result = await isVideoInAnyMylist(video.id)
        setIsInMylist(result.inMylist)
        setMylistIds(result.mylistIds)
      } catch (error) {
        // エラーが発生してもUIは正常に表示
        // eslint-disable-next-line no-console
        console.error('Failed to check mylist status:', error)
        setIsInMylist(false)
        setMylistIds([])
        setCheckError(error instanceof Error ? error : new Error('Unknown error'))
      }
    }
    
    if (!isLoading) {
      checkStatus()
    }
  }, [video.id, isLoading, isVideoInAnyMylist])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    // 常にモーダルを表示（登録済みでも未登録でも）
    setShowModal(true)
  }

  const handleRemoveFromAll = async () => {
    setIsProcessing(true)
    try {
      for (const mylistId of mylistIds) {
        await removeVideoFromMylist(mylistId, video.id)
      }
      setIsInMylist(false)
      setMylistIds([])
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove from mylists:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleAddToMylist = async (mylistId: string) => {
    setIsProcessing(true)
    try {
      // RankingItemから直接MylistVideo構造を構築（型の不整合を解決）
      const mylistVideoData = {
        id: video.id,
        title: video.title,
        thumbURL: video.thumbURL || '',
        // MylistVideo型に合わせたフィールド名を使用
        views: video.views || 0,
        comments: video.comments || 0,
        mylists: video.mylists || 0,
        likes: video.likes || 0,
        authorName: video.authorName || '',
        authorId: video.authorId || '',
        authorIcon: video.authorIcon || undefined, // 重要: authorIconを含める
        registeredAt: video.registeredAt || undefined,
        duration: video.duration || undefined
      }
      
      const success = await addVideoToMylist(mylistId, mylistVideoData)
      if (success) {
        setIsInMylist(true)
        setMylistIds([...mylistIds, mylistId])
        showToast('マイリストに追加しました')
        // モーダルは開いたままにする（削除）
      } else {
        showToast('マイリストへの追加に失敗しました', 'error')
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add to mylist:', error)
      showToast('マイリストへの追加に失敗しました', 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  // SSR時またはクライアント側の初期化前はプレースホルダーを表示
  if (!isClient || isLoading) {
    if (asMenuItem) {
      return (
        <button
          type="button"
          data-testid="mylist-button-placeholder"
          className="item-action-menu__item"
          disabled
        >
          <span aria-hidden="true">＋</span>
          マイリストに追加
        </button>
      )
    }
    return (
      <div
        data-testid="mylist-button-placeholder"
        className="mylist-button-placeholder"
        title="読み込み中..."
      />
    )
  }

  return (
    <>
      <button
        data-testid="mylist-button"
        aria-label={isInMylist ? "マイリストから削除" : "マイリストに追加"}
        onClick={handleClick}
        onTouchStart={(e) => {
          // 親のVideoContextMenuの長押し検出を防ぐ
          e.stopPropagation()
        }}
        onTouchEnd={(e) => {
          // 親要素への伝播のみ止める（preventDefaultは削除）
          e.stopPropagation()
        }}
        disabled={isProcessing}
        className={
          asMenuItem
            ? 'item-action-menu__item'
            : `mylist-button ${
                isInMylist ? 'mylist-button--active' : 'mylist-button--normal'
              } ${isProcessing ? 'mylist-button--processing' : ''}`
        }
        title={isInMylist ? "マイリストから削除" : "マイリストに追加"}
      >
        {asMenuItem ? (
          <>
            <span aria-hidden="true">{isInMylist ? '✓' : '＋'}</span>
            {isInMylist ? 'マイリスト登録済み' : 'マイリストに追加'}
          </>
        ) : (
          <span className="mylist-button__icon">{isInMylist ? '✓' : '+'}</span>
        )}
      </button>

      {/* マイリスト選択モーダル */}
      {showModal && (
        <MylistModal
          mylists={mylists}
          selectedMylistIds={mylistIds}
          onAddToMylist={async (mylistId) => {
            await handleAddToMylist(mylistId)
            // モーダルは開いたままにする
          }}
          onRemoveFromMylist={async (mylistId) => {
            setIsProcessing(true)
            try {
              await removeVideoFromMylist(mylistId, video.id)
              setMylistIds(mylistIds.filter(id => id !== mylistId))
              if (mylistIds.length === 1) {
                setIsInMylist(false)
              }
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('Failed to remove from mylist:', error)
            } finally {
              setIsProcessing(false)
            }
          }}
          onClose={() => {
            setShowModal(false)
            // モーダルを閉じるときに親要素のホバー状態をリセット
            const rankingItem = document.querySelector(`[data-video-id="${video.id}"]`) as HTMLElement
            if (rankingItem && !('ontouchstart' in window)) {
              rankingItem.style.backgroundColor = 'var(--surface-color)'
            }
          }}
          onCreateMylist={async (name, description) => {
            const newMylistId = await createMylist(name, description)
            if (newMylistId) {
              await handleAddToMylist(newMylistId)
            }
          }}
          isProcessing={isProcessing}
        />
      )}
    </>
  )
}