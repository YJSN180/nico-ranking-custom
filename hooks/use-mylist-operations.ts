'use client'

import { useState, useEffect, useRef } from 'react'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'
import type { Mylist, Video } from '@/lib/storage/types'

export function useMylistOperations() {
  const [mylists, setMylists] = useState<Mylist[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const dbManagerRef = useRef<DBManager | null>(null)
  const mylistManagerRef = useRef<MylistManager | null>(null)

  useEffect(() => {
    let mounted = true

    const init = async () => {
      // Wait for hydration
      await new Promise(resolve => setTimeout(resolve, 100))
      
      if (!mounted) return

      try {
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

  const addVideoToMylist = async (mylistId: string, video: Video): Promise<boolean> => {
    if (!mylistManagerRef.current) return false

    try {
      await mylistManagerRef.current.addVideoToMylist(mylistId, video)
      return true
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add video to mylist:', error)
      return false
    }
  }

  const removeVideoFromMylist = async (mylistId: string, videoId: string): Promise<boolean> => {
    if (!mylistManagerRef.current) return false

    try {
      await mylistManagerRef.current.removeVideoFromMylist(mylistId, videoId)
      return true
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove video from mylist:', error)
      return false
    }
  }

  const isVideoInAnyMylist = async (videoId: string): Promise<{ inMylist: boolean; mylistIds: string[] }> => {
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