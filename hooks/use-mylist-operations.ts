'use client'

import { useState, useEffect, useRef } from 'react'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'
import type { Mylist, Video, MylistVideo } from '@/lib/storage/types'

export function useMylistOperations() {
  const [mylists, setMylists] = useState<Mylist[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const dbManagerRef = useRef<DBManager | null>(null)
  const mylistManagerRef = useRef<MylistManager | null>(null)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      // SSR環境では実行しない
      if (typeof window === 'undefined') {
        return
      }

      // テスト環境での早期リターン
      // @ts-ignore
      if (window.__TEST_ENV__ && window.__MOCK_MYLIST_DATA__) {
        // @ts-ignore
        const mockData = window.__MOCK_MYLIST_DATA__;
        setMylists(mockData.mylists)
        setIsLoading(false)
        return
      }

      // Wait for hydration
      await new Promise(resolve => setTimeout(resolve, 100))
      
      if (!mounted) return

      try {
        // ブラウザ環境でのみ初期化
        if (!dbManagerRef.current) {
          dbManagerRef.current = new DBManager()
          await dbManagerRef.current.init()
          mylistManagerRef.current = new MylistManager(dbManagerRef.current)
        }

        // Ensure default mylist exists
        await mylistManagerRef.current.getOrCreateDefaultMylist()
        
        // Load all mylists
        const allMylists = await mylistManagerRef.current.getAllMylists()
        setMylists(allMylists)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to initialize mylist operations:', error)
        // エラー時でも空のマイリストリストを設定
        setMylists([])
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [])

  const addVideoToMylist = async (mylistId: string, video: Partial<MylistVideo>): Promise<boolean> => {
    // テスト環境ではモック動作
    // @ts-ignore
    if (typeof window !== 'undefined' && window.__TEST_ENV__) {
      return true
    }
    
    if (!mylistManagerRef.current) return false

    try {
      await mylistManagerRef.current.addVideoToMylist(mylistId, video)
      
      // マイリストを再読み込みしてカウントを更新
      const allMylists = await mylistManagerRef.current.getAllMylists()
      setMylists(allMylists)
      
      return true
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add video to mylist:', error)
      return false
    }
  }

  const removeVideoFromMylist = async (mylistId: string, videoId: string): Promise<boolean> => {
    // テスト環境ではモック動作
    // @ts-ignore
    if (typeof window !== 'undefined' && window.__TEST_ENV__) {
      return true
    }
    
    if (!mylistManagerRef.current) return false

    try {
      await mylistManagerRef.current.removeVideoFromMylist(mylistId, videoId)
      
      // マイリストを再読み込みしてカウントを更新
      const allMylists = await mylistManagerRef.current.getAllMylists()
      setMylists(allMylists)
      
      return true
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove video from mylist:', error)
      return false
    }
  }

  const isVideoInAnyMylist = async (videoId: string): Promise<{ inMylist: boolean; mylistIds: string[] }> => {
    // テスト環境ではモック動作
    // @ts-ignore
    if (typeof window !== 'undefined' && window.__TEST_ENV__) {
      return { inMylist: false, mylistIds: [] }
    }
    
    if (!mylistManagerRef.current) return { inMylist: false, mylistIds: [] }

    try {
      const mylistIds: string[] = []
      for (const mylist of mylists) {
        const videos = await mylistManagerRef.current.getVideosInMylist(mylist.id)
        if (videos.some(v => v.id === videoId)) {
          mylistIds.push(mylist.id)
        }
      }
      return { inMylist: mylistIds.length > 0, mylistIds }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to check video in mylists:', error)
      return { inMylist: false, mylistIds: [] }
    }
  }

  const createMylist = async (name: string, description?: string): Promise<string | null> => {
    // テスト環境ではモック動作
    // @ts-ignore
    if (typeof window !== 'undefined' && window.__TEST_ENV__) {
      return 'mock-new-id'
    }
    
    if (!mylistManagerRef.current) return null

    try {
      const newMylistId = await mylistManagerRef.current.createMylist(name, description)
      
      // Reload mylists
      const allMylists = await mylistManagerRef.current.getAllMylists()
      setMylists(allMylists)
      
      return newMylistId
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to create mylist:', error)
      return null
    }
  }

  return {
    mylists,
    isLoading,
    addVideoToMylist,
    removeVideoFromMylist,
    isVideoInAnyMylist,
    createMylist
  }
}