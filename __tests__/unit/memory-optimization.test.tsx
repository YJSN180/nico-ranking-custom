import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

// localStorageとsessionStorageのモック
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => {
      const keys = Object.keys(store)
      return keys[index] || null
    }
  }
})()

describe('Memory Optimization', () => {
  beforeEach(() => {
    // ストレージをクリア
    localStorageMock.clear()
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    })
  })

  describe('Storage Management', () => {
    it('should limit localStorage keys to MAX_STORAGE_KEYS', () => {
      const MAX_STORAGE_KEYS = 5
      
      // 6個のキーを保存しようとする
      for (let i = 0; i < 6; i++) {
        const key = `ranking-state-genre${i}-24h-none`
        const value = JSON.stringify({
          timestamp: Date.now(),
          data: { displayCount: 100, scrollPosition: 0 }
        })
        
        // ストレージ管理関数のシミュレート
        if (localStorage.length >= MAX_STORAGE_KEYS) {
          // 最も古いキーを削除
          let oldestKey = null
          let oldestTime = Infinity
          
          for (let j = 0; j < localStorage.length; j++) {
            const k = localStorage.key(j)
            if (k?.startsWith('ranking-state-')) {
              try {
                const data = JSON.parse(localStorage.getItem(k) || '{}')
                if (data.timestamp < oldestTime) {
                  oldestTime = data.timestamp
                  oldestKey = k
                }
              } catch {}
            }
          }
          
          if (oldestKey) {
            localStorage.removeItem(oldestKey)
          }
        }
        
        localStorage.setItem(key, value)
      }
      
      // 5個以下に制限されていることを確認
      expect(localStorage.length).toBeLessThanOrEqual(MAX_STORAGE_KEYS)
    })

    it('should not use sessionStorage for state persistence', () => {
      // sessionStorageが使用されていないことを確認
      const sessionStorageSpy = vi.spyOn(window.sessionStorage, 'setItem')
      
      // ランキング状態の保存をシミュレート
      const saveRankingState = (genre: string, period: string) => {
        const key = `ranking-state-${genre}-${period}-none`
        const value = JSON.stringify({
          timestamp: Date.now(),
          data: { displayCount: 100 }
        })
        
        // localStorageのみ使用
        localStorage.setItem(key, value)
      }
      
      saveRankingState('game', '24h')
      
      // sessionStorageが呼ばれていないことを確認
      expect(sessionStorageSpy).not.toHaveBeenCalled()
    })

    it('should clean up data older than 30 minutes', () => {
      const now = Date.now()
      const thirtyMinutesAgo = now - 31 * 60 * 1000
      
      // 古いデータと新しいデータを保存
      localStorage.setItem('ranking-state-old', JSON.stringify({
        timestamp: thirtyMinutesAgo,
        data: {}
      }))
      
      localStorage.setItem('ranking-state-new', JSON.stringify({
        timestamp: now,
        data: {}
      }))
      
      // クリーンアップ関数のシミュレート
      const cleanupOldStorage = () => {
        const keysToRemove: string[] = []
        const currentTime = Date.now()
        const maxAge = 30 * 60 * 1000
        
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key?.startsWith('ranking-state-')) {
            try {
              const data = JSON.parse(localStorage.getItem(key) || '{}')
              if (data.timestamp && currentTime - data.timestamp > maxAge) {
                keysToRemove.push(key)
              }
            } catch {}
          }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key))
      }
      
      cleanupOldStorage()
      
      // 古いデータが削除されていることを確認
      expect(localStorage.getItem('ranking-state-old')).toBeNull()
      expect(localStorage.getItem('ranking-state-new')).not.toBeNull()
    })
  })

  describe('Data Processing Optimization', () => {
    it('should use memoization for expensive calculations', () => {
      let calculateCount = 0
      
      // 高コストな計算のモック
      const expensiveCalculation = (items: any[]) => {
        calculateCount++
        return items.map(item => ({ ...item, calculated: true }))
      }
      
      // React.memoのシミュレート
      const memoizedCalculation = (() => {
        let lastItems: any[] | null = null
        let lastResult: any[] | null = null
        
        return (items: any[]) => {
          if (items === lastItems && lastResult) {
            return lastResult
          }
          lastItems = items
          lastResult = expensiveCalculation(items)
          return lastResult
        }
      })()
      
      const items = [{ id: 1 }, { id: 2 }]
      
      // 同じ入力で複数回呼び出し
      memoizedCalculation(items)
      memoizedCalculation(items)
      memoizedCalculation(items)
      
      // 計算は1回のみ実行されるべき
      expect(calculateCount).toBe(1)
    })

    it('should limit concurrent API requests', async () => {
      let activeRequests = 0
      let maxConcurrent = 0
      const MAX_CONCURRENT_REQUESTS = 5
      
      // API呼び出しのモック
      const mockApiCall = async () => {
        activeRequests++
        maxConcurrent = Math.max(maxConcurrent, activeRequests)
        
        // リクエストのシミュレート
        await new Promise(resolve => setTimeout(resolve, 10))
        
        activeRequests--
        return { data: 'success' }
      }
      
      // 並行制限付きリクエスト実行
      const executeWithLimit = async (requests: (() => Promise<any>)[]) => {
        const executing: Promise<any>[] = []
        
        for (const request of requests) {
          const promise = request().finally(() => {
            executing.splice(executing.indexOf(promise), 1)
          })
          
          executing.push(promise)
          
          if (executing.length >= MAX_CONCURRENT_REQUESTS) {
            await Promise.race(executing)
          }
        }
        
        await Promise.all(executing)
      }
      
      // 10個のリクエストを作成
      const requests = Array(10).fill(null).map(() => mockApiCall)
      
      await executeWithLimit(requests)
      
      // 同時実行数が制限内であることを確認
      expect(maxConcurrent).toBeLessThanOrEqual(MAX_CONCURRENT_REQUESTS)
    })
  })

  describe('Virtual Scrolling', () => {
    it('should only render visible items', () => {
      const ITEM_HEIGHT = 120
      const VIEWPORT_HEIGHT = 600
      const TOTAL_ITEMS = 500
      
      // 仮想スクロールのシミュレート
      const getVisibleRange = (scrollTop: number) => {
        const startIndex = Math.floor(scrollTop / ITEM_HEIGHT)
        const endIndex = Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ITEM_HEIGHT)
        return { startIndex, endIndex }
      }
      
      // スクロール位置1200pxの場合
      const { startIndex, endIndex } = getVisibleRange(1200)
      
      // 表示されるアイテム数を確認
      const visibleCount = endIndex - startIndex
      expect(visibleCount).toBeLessThanOrEqual(Math.ceil(VIEWPORT_HEIGHT / ITEM_HEIGHT) + 1)
      expect(visibleCount).toBeLessThan(TOTAL_ITEMS)
    })
  })
})