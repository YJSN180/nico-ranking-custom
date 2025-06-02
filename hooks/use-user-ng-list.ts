import { useState, useEffect, useCallback } from 'react'

export interface UserNGList {
  videoIds: string[]
  videoTitles: {
    exact: string[]
    partial: string[]
  }
  authorIds: string[]
  authorNames: {
    exact: string[]
    partial: string[]
  }
  version: number
  totalCount: number
  updatedAt: string
}

const STORAGE_KEY = 'user-ng-list'
const CURRENT_VERSION = 1

const defaultNGList: UserNGList = {
  videoIds: [],
  videoTitles: {
    exact: [],
    partial: [],
  },
  authorIds: [],
  authorNames: {
    exact: [],
    partial: [],
  },
  version: CURRENT_VERSION,
  totalCount: 0,
  updatedAt: new Date().toISOString(),
}

export function useUserNGList() {
  const [ngList, setNGList] = useState<UserNGList>(defaultNGList)

  // 初回読み込み
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.version === CURRENT_VERSION) {
          setNGList(parsed)
        }
      }
    } catch (error) {
      // エラーは無視してデフォルト値を使用
    }
  }, [])

  // NGリストを保存
  const saveNGList = useCallback((list: UserNGList) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch (error) {
      // ストレージエラーは無視
    }
  }, [])

  // 総数を再計算
  const recalculateTotalCount = useCallback((list: UserNGList): number => {
    return (
      list.videoIds.length +
      list.videoTitles.exact.length +
      list.videoTitles.partial.length +
      list.authorIds.length +
      list.authorNames.exact.length +
      list.authorNames.partial.length
    )
  }, [])

  // 動画ID追加
  const addVideoId = useCallback((videoId: string) => {
    setNGList(prev => {
      if (prev.videoIds.includes(videoId)) return prev
      
      const newList = {
        ...prev,
        videoIds: [...prev.videoIds, videoId],
        updatedAt: new Date().toISOString(),
      }
      newList.totalCount = recalculateTotalCount(newList)
      saveNGList(newList)
      return newList
    })
  }, [saveNGList, recalculateTotalCount])

  // 動画ID削除
  const removeVideoId = useCallback((videoId: string) => {
    setNGList(prev => {
      const newList = {
        ...prev,
        videoIds: prev.videoIds.filter(id => id !== videoId),
        updatedAt: new Date().toISOString(),
      }
      newList.totalCount = recalculateTotalCount(newList)
      saveNGList(newList)
      return newList
    })
  }, [saveNGList, recalculateTotalCount])

  // 動画タイトル追加
  const addVideoTitle = useCallback((title: string, type: 'exact' | 'partial') => {
    setNGList(prev => {
      if (prev.videoTitles[type].includes(title)) return prev
      
      const newList = {
        ...prev,
        videoTitles: {
          ...prev.videoTitles,
          [type]: [...prev.videoTitles[type], title],
        },
        updatedAt: new Date().toISOString(),
      }
      newList.totalCount = recalculateTotalCount(newList)
      saveNGList(newList)
      return newList
    })
  }, [saveNGList, recalculateTotalCount])

  // 動画タイトル削除
  const removeVideoTitle = useCallback((title: string, type: 'exact' | 'partial') => {
    setNGList(prev => {
      const newList = {
        ...prev,
        videoTitles: {
          ...prev.videoTitles,
          [type]: prev.videoTitles[type].filter(t => t !== title),
        },
        updatedAt: new Date().toISOString(),
      }
      newList.totalCount = recalculateTotalCount(newList)
      saveNGList(newList)
      return newList
    })
  }, [saveNGList, recalculateTotalCount])

  // 投稿者ID追加
  const addAuthorId = useCallback((authorId: string) => {
    setNGList(prev => {
      if (prev.authorIds.includes(authorId)) return prev
      
      const newList = {
        ...prev,
        authorIds: [...prev.authorIds, authorId],
        updatedAt: new Date().toISOString(),
      }
      newList.totalCount = recalculateTotalCount(newList)
      saveNGList(newList)
      return newList
    })
  }, [saveNGList, recalculateTotalCount])

  // 投稿者ID削除
  const removeAuthorId = useCallback((authorId: string) => {
    setNGList(prev => {
      const newList = {
        ...prev,
        authorIds: prev.authorIds.filter(id => id !== authorId),
        updatedAt: new Date().toISOString(),
      }
      newList.totalCount = recalculateTotalCount(newList)
      saveNGList(newList)
      return newList
    })
  }, [saveNGList, recalculateTotalCount])

  // 投稿者名追加
  const addAuthorName = useCallback((name: string, type: 'exact' | 'partial') => {
    setNGList(prev => {
      if (prev.authorNames[type].includes(name)) return prev
      
      const newList = {
        ...prev,
        authorNames: {
          ...prev.authorNames,
          [type]: [...prev.authorNames[type], name],
        },
        updatedAt: new Date().toISOString(),
      }
      newList.totalCount = recalculateTotalCount(newList)
      saveNGList(newList)
      return newList
    })
  }, [saveNGList, recalculateTotalCount])

  // 投稿者名削除
  const removeAuthorName = useCallback((name: string, type: 'exact' | 'partial') => {
    setNGList(prev => {
      const newList = {
        ...prev,
        authorNames: {
          ...prev.authorNames,
          [type]: prev.authorNames[type].filter(n => n !== name),
        },
        updatedAt: new Date().toISOString(),
      }
      newList.totalCount = recalculateTotalCount(newList)
      saveNGList(newList)
      return newList
    })
  }, [saveNGList, recalculateTotalCount])

  // NGリストをリセット
  const resetNGList = useCallback(() => {
    const newList = {
      ...defaultNGList,
      updatedAt: new Date().toISOString(),
    }
    setNGList(newList)
    saveNGList(newList)
  }, [saveNGList])

  // フィルタリング関数
  const filterItems = useCallback((items: any[]) => {
    // 高速化のためSetを作成
    const videoIdSet = new Set(ngList.videoIds)
    const videoTitleExactSet = new Set(ngList.videoTitles.exact)
    const authorIdSet = new Set(ngList.authorIds)
    const authorNameExactSet = new Set(ngList.authorNames.exact)

    return items.filter(item => {
      // 動画IDチェック
      if (videoIdSet.has(item.id)) return false

      // 動画タイトル（完全一致）チェック
      if (videoTitleExactSet.has(item.title)) return false

      // 動画タイトル（部分一致）チェック
      if (ngList.videoTitles.partial.some(partial => item.title.includes(partial))) {
        return false
      }

      // 投稿者IDチェック
      if (item.authorId && authorIdSet.has(item.authorId)) return false

      // 投稿者名（完全一致）チェック
      if (item.authorName && authorNameExactSet.has(item.authorName)) return false

      // 投稿者名（部分一致）チェック
      if (item.authorName && ngList.authorNames.partial.some(partial => item.authorName.includes(partial))) {
        return false
      }

      return true
    })
  }, [ngList])

  return {
    ngList,
    addVideoId,
    removeVideoId,
    addVideoTitle,
    removeVideoTitle,
    addAuthorId,
    removeAuthorId,
    addAuthorName,
    removeAuthorName,
    resetNGList,
    filterItems,
  }
}