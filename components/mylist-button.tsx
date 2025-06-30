'use client'

import { useState, useEffect } from 'react'
import { useMylistOperations } from '@/hooks/use-mylist-operations'
import { MylistModal } from './mylist-modal'
import type { RankingItem } from '@/types/ranking'
import type { Video } from '@/lib/storage/types'

interface MylistButtonProps {
  video: RankingItem
}

export function MylistButton({ video }: MylistButtonProps) {
  // SSR時はnullを返す
  const [isClient, setIsClient] = useState(false)
  const { mylists, isLoading, addVideoToMylist, removeVideoFromMylist, isVideoInAnyMylist, createMylist } = useMylistOperations()
  const [isInMylist, setIsInMylist] = useState(false)
  const [mylistIds, setMylistIds] = useState<string[]>([])
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
    console.log('[MylistButton] clicked', { isInMylist, mylists, isLoading })
    
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
        registeredAt: video.registeredAt || undefined
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
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '20px',
          background: 'var(--surface-secondary)',
          opacity: 0.5,
          flexShrink: 0,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
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
        style={{
          background: isInMylist ? 'var(--success-color)' : 'var(--surface-color)',
          border: `1px solid ${isInMylist ? 'var(--success-color)' : 'var(--border-color)'}`,
          borderRadius: '20px',
          padding: '6px',
          cursor: isProcessing ? 'wait' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isInMylist ? 'white' : 'var(--text-secondary)',
          transition: 'all 0.2s',
          opacity: isProcessing ? 0.6 : 1,
          width: '32px',
          height: '32px',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!isProcessing && !isInMylist) {
            e.currentTarget.style.background = 'var(--surface-hover)'
            e.currentTarget.style.borderColor = 'var(--primary-color)'
            e.currentTarget.style.color = 'var(--primary-color)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isProcessing && !isInMylist) {
            e.currentTarget.style.background = 'var(--surface-color)'
            e.currentTarget.style.borderColor = 'var(--border-color)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }
        }}
        title={isInMylist ? "マイリストから削除" : "マイリストに追加"}
      >
        <span style={{ fontSize: '16px', lineHeight: 1 }}>{isInMylist ? '✓' : '+'}</span>
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