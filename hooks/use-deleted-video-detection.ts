import { useEffect, useState, useRef } from 'react'
import type { MylistVideo } from '@/lib/storage/types'
import { detectDeletedVideos } from '@/lib/deleted-video-detector'

// 削除チェックに必要な最小限のインターフェース
interface VideoForCheck {
  id: string
  title: string
  thumbURL: string
}

interface UseDeletedVideoDetectionResult {
  deletedVideoIds: Set<string>
  isChecking: boolean
  checkVideos: (videos: VideoForCheck[]) => Promise<void>
}

/**
 * 削除済み動画を検出するカスタムフック
 */
export function useDeletedVideoDetection(): UseDeletedVideoDetectionResult {
  const [deletedVideoIds, setDeletedVideoIds] = useState<Set<string>>(new Set())
  const [isChecking, setIsChecking] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const checkVideos = async (videos: VideoForCheck[]) => {
    // 既に検査中の場合はキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (videos.length === 0) {
      setDeletedVideoIds(new Set())
      return
    }

    setIsChecking(true)
    abortControllerRef.current = new AbortController()

    try {
      // MylistVideo型に変換（detectDeletedVideosの要求に合わせる）
      const videosForDetection: MylistVideo[] = videos.map(v => ({
        id: v.id,
        mylistId: '',  // ダミー値
        title: v.title,
        thumbURL: v.thumbURL,
        addedAt: Date.now()  // ダミー値
      }))
      
      // 削除済み動画を検出
      const results = await detectDeletedVideos(videosForDetection)
      
      // 削除済み動画のIDのセットを作成
      const deletedIds = new Set<string>()
      Object.entries(results).forEach(([videoId, available]) => {
        if (!available) {
          deletedIds.add(videoId)
        }
      })

      // 中断されていない場合のみ状態を更新
      if (!abortControllerRef.current.signal.aborted) {
        setDeletedVideoIds(deletedIds)
      }
    } catch (error) {
      // エラーが発生した場合はログに記録
      console.error('Failed to detect deleted videos:', error)
    } finally {
      setIsChecking(false)
      abortControllerRef.current = null
    }
  }

  return {
    deletedVideoIds,
    isChecking,
    checkVideos,
  }
}

/**
 * 削除済み動画のサムネイルURLを取得
 */
export function getDeletedVideoThumbnail(): string {
  return '/cantwatch.jpg'
}