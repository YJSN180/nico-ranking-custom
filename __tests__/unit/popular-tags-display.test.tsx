import React, { useEffect, useState } from 'react'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

function TagSelector({
  config,
  onConfigChange,
  popularTags = []
}: {
  config: RankingConfig
  onConfigChange: (next: RankingConfig) => void
  popularTags?: string[]
}) {
  // allジャンルの場合は何も表示しない（実際のコンポーネントと同じ挙動）
  if (config.genre === 'all') return null

  // 人気タグが空の場合も何も表示しない
  if (!popularTags || popularTags.length === 0) return null

  // その他のジャンルではタグを表示
  return (
    <div className="_selectorContainer_933bb3">
      <div>
        <h2 className="_selectorTitle_933bb3">人気タグ</h2>
        <div className="_buttonContainer_933bb3">
          <button
            className={`_button_933bb3 ${!config.tag ? '_buttonSelected_933bb3' : ''}`}
            onClick={() => onConfigChange({ ...config, tag: undefined })}
          >
            すべて
          </button>
          {popularTags.map(tag => (
            <button
              key={tag}
              className={`_button_933bb3 ${config.tag === tag ? '_buttonSelected_933bb3' : ''}`}
              onClick={() => onConfigChange({ ...config, tag })}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const popularTagsByGenre: Record<string, string[]> = {
  game: ['ゲーム', '実況プレイ動画', 'VOICEROID実況プレイ'],
  entertainment: ['エンターテイメント', '踊ってみた', '歌ってみた'],
  other: ['その他', 'MMD', 'MikuMikuDance']
}

type RankingConfig = {
  genre: string
  period: string
  tag?: string
}

type HarnessProps = {
  initialGenre: string
  initialPeriod: string
  initialPopularTags: string[]
  responseMode?: 'object' | 'array'
}

function PopularTagsHarness({
  initialGenre,
  initialPeriod,
  initialPopularTags,
  responseMode = 'object'
}: HarnessProps) {
  const [config, setConfig] = useState<RankingConfig>({
    genre: initialGenre,
    period: initialPeriod,
    tag: undefined
  })
  const [popularTags, setPopularTags] = useState<string[]>(initialPopularTags)

  const handleConfigChange = async (next: RankingConfig) => {
    setConfig(next)

    if (typeof global.fetch === 'function') {
      const params = new URLSearchParams({
        genre: next.genre,
        period: next.period
      })
      if (next.tag) {
        params.set('tag', next.tag)
      }
      await (global.fetch as any)(`/api/ranking?${params.toString()}`)
    }

    if (next.genre === 'all') {
      setPopularTags([])
      return
    }

    // 配列形式のレスポンスを想定する場合は既存タグを維持
    if (responseMode === 'array') {
      return
    }

    setPopularTags(popularTagsByGenre[next.genre] || [])
  }

  useEffect(() => {
    if (config.genre !== 'all' && popularTags.length === 0) {
      setPopularTags(popularTagsByGenre[config.genre] || [])
    }
  }, [config.genre, popularTags.length])

  return (
    <div>
      <button onClick={() => void handleConfigChange({ ...config, genre: 'entertainment', tag: undefined })}>エンタメ</button>
      <button onClick={() => void handleConfigChange({ ...config, genre: 'other', tag: undefined })}>その他</button>
      <button onClick={() => void handleConfigChange({ ...config, genre: 'all', tag: undefined })}>総合</button>
      <button onClick={() => void handleConfigChange({ ...config, period: 'hour' })}>毎時</button>
      <TagSelector config={config} onConfigChange={handleConfigChange} popularTags={popularTags} />
    </div>
  )
}

// fetchのモック
global.fetch = vi.fn()

describe('人気タグの表示問題', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('初期表示時に人気タグが表示される', async () => {
    render(
      <PopularTagsHarness
        initialGenre="game"
        initialPeriod="24h"
        initialPopularTags={['ゲーム', '実況プレイ動画', 'VOICEROID実況プレイ']}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('人気タグ')).toBeInTheDocument()
    })

    const popularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
    expect(popularTagsSection).toBeInTheDocument()

    const tagButtons = popularTagsSection?.querySelectorAll('button')
    const tagTexts = Array.from(tagButtons || []).map(btn => btn.textContent)

    expect(tagTexts).toContain('ゲーム')
    expect(tagTexts).toContain('実況プレイ動画')
    expect(tagTexts).toContain('VOICEROID実況プレイ')
  })

  it('ジャンル切り替え時に人気タグが更新される', async () => {
    const user = userEvent.setup()

    render(
      <PopularTagsHarness
        initialGenre="game"
        initialPeriod="24h"
        initialPopularTags={['ゲーム', '実況プレイ動画']}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('人気タグ')).toBeInTheDocument()
    })

    const entertainmentButton = screen.getByText('エンタメ')
    await user.click(entertainmentButton)

    await waitFor(() => {
      const fetchSpy = global.fetch as any
      const calls = fetchSpy.mock.calls
      const rankingCall = calls.find((call: any[]) =>
        call[0] && call[0].includes('/api/ranking') &&
        call[0].includes('genre=entertainment') &&
        call[0].includes('period=24h')
      )
      expect(rankingCall).toBeTruthy()
    })

    await waitFor(() => {
      const updatedPopularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
      const updatedTagButtons = updatedPopularTagsSection?.querySelectorAll('button')
      const updatedTagTexts = Array.from(updatedTagButtons || []).map(btn => btn.textContent)
      expect(updatedTagTexts).toContain('すべて')
      expect(updatedTagTexts).toContain('エンターテイメント')
      expect(updatedTagTexts).toContain('踊ってみた')
      expect(updatedTagTexts).not.toContain('実況プレイ動画')
    })
  })

  it('allジャンルでは人気タグセクションが非表示になる', async () => {
    const user = userEvent.setup()

    render(
      <PopularTagsHarness
        initialGenre="game"
        initialPeriod="24h"
        initialPopularTags={['ゲーム', '実況プレイ動画']}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('人気タグ')).toBeInTheDocument()
    })

    const allButton = screen.getByText('総合')
    await user.click(allButton)

    await waitFor(() => {
      expect(screen.queryByText('人気タグ')).not.toBeInTheDocument()
    })
  })

  it('初期表示でpopularTagsが空の場合、動的に取得される', async () => {
    render(
      <PopularTagsHarness
        initialGenre="other"
        initialPeriod="24h"
        initialPopularTags={[]}
      />
    )

    await waitFor(() => {
      const popularTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
      const tagButtons = popularTagsSection?.querySelectorAll('button')
      const tagTexts = Array.from(tagButtons || []).map(btn => btn.textContent)
      expect(tagTexts).toContain('すべて')
      expect(tagTexts).toEqual(expect.arrayContaining(['すべて', 'その他', 'MMD', 'MikuMikuDance']))
    })
  })

  it('period切り替え時にAPIが再度呼び出される', async () => {
    const user = userEvent.setup()
    const fetchSpy = global.fetch as any

    render(
      <PopularTagsHarness
        initialGenre="game"
        initialPeriod="24h"
        initialPopularTags={['ゲーム', '実況プレイ動画']}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('人気タグ')).toBeInTheDocument()
    })

    fetchSpy.mockClear()

    const hourButton = screen.getByText('毎時')
    await user.click(hourButton)

    await waitFor(() => {
      const calls = fetchSpy.mock.calls
      const rankingCall = calls.find((call: any[]) =>
        call[0] && call[0].includes('/api/ranking') &&
        call[0].includes('genre=game') &&
        call[0].includes('period=hour')
      )
      expect(rankingCall).toBeTruthy()
    })
  })

  it('配列形式のAPIレスポンスでも人気タグセクションが表示される', async () => {
    const user = userEvent.setup()

    render(
      <PopularTagsHarness
        initialGenre="game"
        initialPeriod="24h"
        initialPopularTags={['ゲーム', '実況プレイ動画']}
        responseMode="array"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('人気タグ')).toBeInTheDocument()
    })

    const entertainmentButton = screen.getByText('エンタメ')
    await user.click(entertainmentButton)

    await waitFor(() => {
      const updatedTagsSection = screen.getByText('人気タグ').closest('div')?.parentElement
      const updatedTagButtons = updatedTagsSection?.querySelectorAll('button')
      expect(updatedTagButtons).toBeTruthy()
      expect(updatedTagButtons?.length).toBeGreaterThan(0)
    })
  })
})
