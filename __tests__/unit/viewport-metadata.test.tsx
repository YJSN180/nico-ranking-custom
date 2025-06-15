import { describe, it, expect, vi } from 'vitest'

// Next.js font のモック
vi.mock('next/font/google', () => ({
  Inter: () => ({
    className: 'mocked-inter-font'
  })
}))

describe('Viewport Metadata', () => {
  it('should not have viewport in metadata export', async () => {
    // layout モジュールを動的にインポート
    const { metadata } = await import('@/app/layout')
    
    // viewport メタデータが metadata エクスポートに含まれていないことを確認
    expect(metadata).toBeDefined()
    expect('viewport' in metadata).toBe(false)
  })

  it('should have viewport as separate export', async () => {
    const { viewport } = await import('@/app/layout')
    
    // viewport が別のエクスポートとして存在することを確認
    expect(viewport).toBeDefined()
    expect(viewport.width).toBe('device-width')
    expect(viewport.initialScale).toBe(1)
    expect(viewport.maximumScale).toBe(5)
  })

  it('should have proper metadata structure', async () => {
    const { metadata } = await import('@/app/layout')
    
    expect(metadata.title).toBe('ニコニコランキング(Re:turn)')
    expect(metadata.description).toBe('ニコニコ動画のランキングを今すぐチェック！')
  })
})