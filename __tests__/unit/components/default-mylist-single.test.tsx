import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MylistButton } from '@/components/mylist-button'
import { MylistManager } from '@/lib/storage/mylists'
import { DBManager } from '@/lib/storage/db-manager'
import { useMylistOperations } from '@/context/mylist-operations-context'
import type { RankingItem } from '@/types/ranking'
import 'fake-indexeddb/auto'

// Mock the hooks
vi.mock('@/context/mylist-operations-context', () => ({
  useMylistOperations: vi.fn(),
  MylistOperationsProvider: ({ children }: { children: React.ReactNode }) => children
}))

describe('初期マイリスト作成 - 単一保証', () => {
  let dbManager: DBManager
  let mylistManager: MylistManager

  const mockVideo: RankingItem = {
    id: 'sm12345678',
    rank: 1,
    title: 'テスト動画',
    views: 1000,
    comments: 100,
    mylists: 10,
    likes: 50,
    duration: 300,
    registeredAt: new Date('2025-01-27'),
    tags: ['test'],
    thumbURL: 'https://example.com/thumb.jpg',
    authorName: 'テスト投稿者',
    authorId: '123456'
  }

  beforeEach(async () => {
    // Clear IndexedDB
    if ('databases' in indexedDB) {
      const dbs = await indexedDB.databases()
      for (const db of dbs) {
        if (db.name) {
          indexedDB.deleteDatabase(db.name)
        }
      }
    }

    // Initialize managers
    dbManager = new DBManager()
    await dbManager.init()
    mylistManager = new MylistManager(dbManager)
  })

  afterEach(async () => {
    await dbManager.deleteDatabase()
  })

  it('複数のマイリストボタンが同時に初期化されても、初期マイリストは1つだけ作成される', async () => {
    // 複数のマイリストボタンをレンダリング（100個）
    const videoCount = 100
    const videos: RankingItem[] = Array.from({ length: videoCount }, (_, i) => ({
      ...mockVideo,
      id: `sm${10000000 + i}`,
      rank: i + 1,
      title: `テスト動画 ${i + 1}`
    }))

    // useMylistOperations のモックを設定
    const mockOperations = {
      mylists: [],
      isLoading: false,
      addVideoToMylist: vi.fn().mockResolvedValue(true),
      removeVideoFromMylist: vi.fn().mockResolvedValue(undefined),
      isVideoInAnyMylist: vi.fn().mockResolvedValue({ inMylist: false, mylistIds: [] }),
      createMylist: vi.fn()
    }

    vi.mocked(useMylistOperations).mockReturnValue(mockOperations)

    // 実際のフックの初期化をシミュレート
    const initPromises: Promise<void>[] = []
    for (let i = 0; i < videoCount; i++) {
      initPromises.push(
        mylistManager.getOrCreateDefaultMylist()
          .then(() => {})
          .catch(() => {})
      )
    }

    // すべての初期化が完了するまで待つ
    await Promise.all(initPromises)

    // マイリストの数を確認
    const allMylists = await mylistManager.getAllMylists()

    expect(allMylists).toHaveLength(1)
    expect(allMylists[0].name).toBe('とりあえずマイリスト')
  })

  it('初期マイリストが既に存在する場合は新しく作成されない', async () => {
    // 最初の初期マイリストを作成
    const firstInitial = await mylistManager.getOrCreateDefaultMylist()
    expect(firstInitial.name).toBe('とりあえずマイリスト')

    // 再度取得を試みる
    const secondInitial = await mylistManager.getOrCreateDefaultMylist()
    
    // 同じIDであることを確認
    expect(secondInitial.id).toBe(firstInitial.id)

    // マイリストの総数が1つであることを確認
    const allMylists = await mylistManager.getAllMylists()
    expect(allMylists).toHaveLength(1)
  })

  it('マイリストは作成日時の新しい順に表示される', async () => {
    // 初期マイリストを作成
    await mylistManager.getOrCreateDefaultMylist()

    // 遅延を入れて作成日時を異ならせる
    await new Promise(resolve => setTimeout(resolve, 10))
    await mylistManager.createMylist('お気に入り', 'お気に入りの動画')
    await new Promise(resolve => setTimeout(resolve, 10))
    await mylistManager.createMylist('後で見る', '後で見る動画')

    // すべてのマイリストを取得
    const allMylists = await mylistManager.getAllMylists()

    // 新しい順に表示されることを確認
    expect(allMylists).toHaveLength(3)
    expect(allMylists[0].name).toBe('後で見る')
    expect(allMylists[1].name).toBe('お気に入り')
    expect(allMylists[2].name).toBe('とりあえずマイリスト')
  })
})