import React from 'react'
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'
import { MylistOperationsProvider, useMylistOperations } from '@/context/mylist-operations-context'

// MylistOperationsProvider はルートの layout にあり、クライアント遷移では作り直されない。
// /mylists で作成・削除したマイリストが、戻った画面のマイリスト追加モーダルの一覧に出ることを確かめる。
// データはすべて合成値。

// vitest.setup.ts が全体でモックしているので、このファイルでは本物を使う
vi.unmock('@/context/mylist-operations-context')

let currentPathname = '/'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn(), toString: vi.fn(() => '') }),
  usePathname: () => currentPathname,
  useParams: () => ({}),
}))

function MylistNames(): React.ReactElement {
  const { mylists, isLoading } = useMylistOperations()
  if (isLoading) return <p>読み込み中</p>
  return (
    <ul>
      {mylists.map((mylist) => (
        <li key={mylist.id}>{mylist.name}</li>
      ))}
    </ul>
  )
}

function renderAt(pathname: string): ReturnType<typeof render> {
  currentPathname = pathname
  return render(
    <MylistOperationsProvider>
      <MylistNames />
    </MylistOperationsProvider>
  )
}

describe('MylistOperationsProvider の一覧', () => {
  const testFlags: Record<string, unknown> = {}

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    // テスト用のモック一覧（vitest.setup.ts）ではなく、本番と同じく IndexedDB から読む
    const flags = window as unknown as Record<string, unknown>
    testFlags.__TEST_ENV__ = flags.__TEST_ENV__
    testFlags.__MOCK_MYLIST_DATA__ = flags.__MOCK_MYLIST_DATA__
    delete flags.__TEST_ENV__
    delete flags.__MOCK_MYLIST_DATA__
  })

  afterEach(() => {
    Object.assign(window, testFlags)
  })

  it('/mylists で作成・削除したマイリストが、クライアント遷移で戻った画面に反映される', async () => {
    const dbManager = new DBManager()
    await dbManager.init()
    const manager = new MylistManager(dbManager)
    const oldId = await manager.createMylist('合成リスト旧')

    const view = renderAt('/')
    await screen.findByText('合成リスト旧')

    // マイリスト管理画面へ移動し、作成と削除をする
    currentPathname = '/mylists'
    view.rerender(
      <MylistOperationsProvider>
        <MylistNames />
      </MylistOperationsProvider>
    )
    await manager.createMylist('合成リスト新')
    await manager.deleteMylist(oldId)

    // ランキング画面へ戻る（← トップページに戻る）
    currentPathname = '/'
    view.rerender(
      <MylistOperationsProvider>
        <MylistNames />
      </MylistOperationsProvider>
    )

    await screen.findByText('合成リスト新')
    expect(screen.queryByText('合成リスト旧')).toBeNull()
  })
})
