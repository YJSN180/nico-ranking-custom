'use client'

import { useState, useEffect } from 'react'
import { useMylistOperations } from '@/context/mylist-operations-context'
import { MylistModal } from './mylist-modal'
import type { RankingItem } from '@/types/ranking'
import './mylist-button.css'

interface MylistButtonProps {
  video: RankingItem
}

export function MylistButton({ video }: MylistButtonProps) {
  // SSR時はnullを返す
  const [isClient, setIsClient] = useState(false)
  const { mylists, isLoading, addVideoToMylist, removeVideoFromMylist, isVideoInAnyMylist, createMylist } = useMylistOperations()
  const [isInMylist, setIsInMylist] = useState(false)
  const [mylistIds, setMylistIds] = useState<string[]>([])
  const [checkError, setCheckError] = useState<Error | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // クライアントサイドでのみ実行
  useEffect(() => {
    setIsClient(true)
  }, [])

  // テスト環境では即座にクライアント状態にする
  useEffect(() => {
    // @ts-ignore
    if (typeof window !== 'undefined' && window.__TEST_ENV__) {
      setIsClient(true)
    }
  }, [])

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
    
    // デバッグログ
    // eslint-disable-next-line no-console
    console.log('[MylistButton] clicked', { 
      isInMylist, 
      mylists: mylists?.length || 0, 
      mylistIds: Array.isArray(mylistIds) ? mylistIds : [],
      isLoading 
    })
    
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
        // モーダルは開いたままにする（削除）
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add to mylist:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  // テスト環境でのデバッグログ
  // @ts-ignore
  if (typeof window !== 'undefined' && window.__TEST_ENV__) {
    // eslint-disable-next-line no-console
    console.log('[MylistButton] Debug:', { isClient, isLoading, mylists: mylists.length })
  }

  // SSR時またはクライアント側の初期化前はプレースホルダーを表示
  if (!isClient || isLoading) {
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
        onTouchEnd={(e) => {
          // 親要素への伝播のみ止める（preventDefaultは削除）
          e.stopPropagation()
        }}
        disabled={isProcessing}
        className={`mylist-button ${
          isInMylist 
            ? 'mylist-button--active' 
            : 'mylist-button--normal'
        } ${isProcessing ? 'mylist-button--processing' : ''}`}
        title={isInMylist ? "マイリストから削除" : "マイリストに追加"}
      >
        <span className="mylist-button__icon">{isInMylist ? '✓' : '+'}</span>
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