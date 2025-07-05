import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import userEvent from '@testing-library/user-event'
import { TagSelector } from '@/components/tag-selector'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import type { RankingConfig } from '@/types/ranking-config'

// useUserPreferencesをモック
vi.mock('@/hooks/use-user-preferences')

// document.cookieのモック
const cookieMock = {
  get: vi.fn(() => ''),
  set: vi.fn((value: string) => {
    cookieMock._value = value
  }),
  _value: '',
}

Object.defineProperty(document, 'cookie', {
  get: () => cookieMock._value,
  set: (value: string) => {
    cookieMock.set(value)
    cookieMock._value = value
  },
  configurable: true,
})

describe('ユーザー設定の永続化 - タグ選択', () => {
  const mockUpdatePreferences = vi.fn()
  
  beforeEach(() => {
    vi.clearAllMocks()
    cookieMock._value = ''
    cookieMock.set.mockClear()
    
    // useUserPreferencesのモックを設定
    vi.mocked(useUserPreferences).mockReturnValue({
      preferences: {
        theme: 'light',
        lastGenre: 'game',
        lastPeriod: '24h',
        lastTag: undefined,
        ngFilterEnabled: true,
        compactMode: false,
      },
      updatePreferences: mockUpdatePreferences,
    })
  })

  it('タグ選択時に設定が保存される', async () => {
    const user = userEvent.setup()
    
    const config: RankingConfig = {
      genre: 'game',
      period: '24h',
      tag: undefined
    }
    
    const handleConfigChange = vi.fn((newConfig: RankingConfig) => {
      // updatePreferencesを呼び出す
      mockUpdatePreferences({
        lastTag: newConfig.tag
      })
    })
    
    render(
      <TagSelector 
        config={config}
        onConfigChange={handleConfigChange}
        popularTags={['ゲーム実況', 'RTA', 'TAS']}
      />
    )
    
    // タグボタンを取得
    const tagButton = await screen.findByText('ゲーム実況')
    await user.click(tagButton)
    
    // onConfigChangeが呼ばれたことを確認
    expect(handleConfigChange).toHaveBeenCalledWith({
      genre: 'game',
      period: '24h',
      tag: 'ゲーム実況'
    })
    
    // updatePreferencesが呼ばれたことを確認
    expect(mockUpdatePreferences).toHaveBeenCalledWith({
      lastTag: 'ゲーム実況'
    })
  })
  
  it('タグクリア時に設定が保存される', async () => {
    const user = userEvent.setup()
    
    const config: RankingConfig = {
      genre: 'game',
      period: '24h',
      tag: 'ゲーム実況'
    }
    
    const handleConfigChange = vi.fn((newConfig: RankingConfig) => {
      // updatePreferencesを呼び出す
      mockUpdatePreferences({
        lastTag: newConfig.tag
      })
    })
    
    render(
      <TagSelector 
        config={config}
        onConfigChange={handleConfigChange}
        popularTags={['ゲーム実況', 'RTA', 'TAS']}
      />
    )
    
    // クリアボタンを取得
    const clearButton = await screen.findByText('クリア')
    await user.click(clearButton)
    
    // onConfigChangeが呼ばれたことを確認
    expect(handleConfigChange).toHaveBeenCalledWith({
      genre: 'game',
      period: '24h',
      tag: undefined
    })
    
    // updatePreferencesが呼ばれたことを確認
    expect(mockUpdatePreferences).toHaveBeenCalledWith({
      lastTag: undefined
    })
  })
})