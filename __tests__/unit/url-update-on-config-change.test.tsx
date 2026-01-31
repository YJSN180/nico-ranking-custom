import { describe, it, expect } from 'vitest'
import { buildRankingConfigUrl } from '@/lib/ranking-url'

describe('URL更新テスト', () => {
  it('ジャンルを変更するとURLが更新される', async () => {
    const url = buildRankingConfigUrl({
      genre: 'game',
      period: '24h',
      tag: undefined
    })
    expect(url).toBe('?genre=game')
  })

  it('期間を変更するとURLが更新される', async () => {
    const url = buildRankingConfigUrl({
      genre: 'all',
      period: 'hour',
      tag: undefined
    })
    expect(url).toBe('?period=hour')
  })

  it('ジャンルと期間を変更するとURLに両方が含まれる', async () => {
    const url = buildRankingConfigUrl({
      genre: 'game',
      period: 'hour',
      tag: undefined
    })
    expect(url).toBe('?genre=game&period=hour')
  })

  it('デフォルト値に戻すとURLパラメータが削除される', async () => {
    const url = buildRankingConfigUrl({
      genre: 'all',
      period: 'hour',
      tag: undefined
    })
    expect(url).toBe('?period=hour')
  })
})
