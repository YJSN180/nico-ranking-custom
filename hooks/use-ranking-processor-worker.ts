import { useEffect, useRef, useCallback, useState } from 'react'
import type { RankingItem } from '@/types/ranking'
import type { NGList } from '@/types/ng-list'

interface WorkerMessage {
  type: 'SUCCESS' | 'ERROR'
  data?: RankingItem[]
  error?: string
}

export function useRankingProcessorWorker() {
  const workerRef = useRef<Worker | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Initialize worker on mount
  useEffect(() => {
    // Only create worker in browser environment with Worker support
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      console.warn('Worker API not available')
      return
    }
    
    try {
      // Create worker with webpack 5 worker syntax
      workerRef.current = new Worker(
        new URL('../workers/ranking-processor.worker.ts', import.meta.url),
        { type: 'module' }
      )
      console.log('Web Worker created successfully')
    } catch (error) {
      console.error('Failed to create Worker:', error)
      return
    }
    
    // Set up message handler
    workerRef.current.onmessage = (event: MessageEvent<WorkerMessage>) => {
      setIsProcessing(false)
      
      if (event.data.type === 'ERROR') {
        setError(event.data.error || 'Unknown error')
      }
    }
    
    // Cleanup on unmount
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])
  
  // Filter rankings using NG list
  const filterRankings = useCallback(
    async (items: RankingItem[], ngList: NGList): Promise<RankingItem[]> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          // Fallback to main thread if worker not available
          console.warn('Worker not available, falling back to main thread')
          resolve(items)
          return
        }
        
        setIsProcessing(true)
        setError(null)
        
        // Set up one-time message handler for this operation
        const handleMessage = (event: MessageEvent<WorkerMessage>) => {
          workerRef.current?.removeEventListener('message', handleMessage)
          setIsProcessing(false)
          
          if (event.data.type === 'SUCCESS' && event.data.data) {
            resolve(event.data.data)
          } else {
            reject(new Error(event.data.error || 'Worker processing failed'))
          }
        }
        
        workerRef.current.addEventListener('message', handleMessage)
        
        // Send message to worker
        workerRef.current.postMessage({
          type: 'FILTER_RANKINGS',
          data: { items, ngList }
        })
      })
    },
    []
  )
  
  // Search rankings
  const searchRankings = useCallback(
    async (items: RankingItem[], query: string): Promise<RankingItem[]> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current || !query.trim()) {
          resolve(items)
          return
        }
        
        setIsProcessing(true)
        setError(null)
        
        const handleMessage = (event: MessageEvent<WorkerMessage>) => {
          workerRef.current?.removeEventListener('message', handleMessage)
          setIsProcessing(false)
          
          if (event.data.type === 'SUCCESS' && event.data.data) {
            resolve(event.data.data)
          } else {
            reject(new Error(event.data.error || 'Worker processing failed'))
          }
        }
        
        workerRef.current.addEventListener('message', handleMessage)
        
        workerRef.current.postMessage({
          type: 'SEARCH_RANKINGS',
          data: { items, searchQuery: query }
        })
      })
    },
    []
  )
  
  // Sort rankings
  const sortRankings = useCallback(
    async (items: RankingItem[], sortBy: 'rank' | 'views' | 'likes' | 'date'): Promise<RankingItem[]> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          resolve(items)
          return
        }
        
        setIsProcessing(true)
        setError(null)
        
        const handleMessage = (event: MessageEvent<WorkerMessage>) => {
          workerRef.current?.removeEventListener('message', handleMessage)
          setIsProcessing(false)
          
          if (event.data.type === 'SUCCESS' && event.data.data) {
            resolve(event.data.data)
          } else {
            reject(new Error(event.data.error || 'Worker processing failed'))
          }
        }
        
        workerRef.current.addEventListener('message', handleMessage)
        
        workerRef.current.postMessage({
          type: 'SORT_RANKINGS',
          data: { items, sortBy }
        })
      })
    },
    []
  )
  
  return {
    filterRankings,
    searchRankings,
    sortRankings,
    isProcessing,
    error
  }
}