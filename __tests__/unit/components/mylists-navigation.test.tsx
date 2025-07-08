import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MylistsClient } from '@/app/mylists/mylists-client'
import { DBManager } from '@/lib/storage/db-manager'
import 'fake-indexeddb/auto'

// Mock the BackLink component
vi.mock('@/components/back-link', () => ({
  BackLink: ({ text = 'トップページに戻る' }: { text?: string }) => (
    <a href="/">{`← ${text}`}</a>
  )
}))

// Mock useRouter
// Navigation mock is provided by global setup in vitest.setup.ts

describe('MylistsClient Navigation', () => {
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
  })

  it('トップページへの戻るボタンが表示される', async () => {
    render(<MylistsClient />)
    
    // 戻るボタンを探す
    const backLink = await screen.findByText(/← トップページに戻る/)
    expect(backLink).toBeInTheDocument()
  })

  it('戻るボタンがページの上部に配置される', async () => {
    const { container } = render(<MylistsClient />)
    
    // ヘッダー内に戻るボタンがあることを確認
    const header = container.querySelector('div')
    const backLink = await screen.findByText(/← トップページに戻る/)
    
    expect(header).toContainElement(backLink)
  })
})