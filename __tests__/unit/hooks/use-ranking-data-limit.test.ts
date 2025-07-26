import { getDeviceBasedLimit } from '@/hooks/use-device-type'

describe('use-ranking-data limit calculation', () => {
  describe('カスタムランキングの取得件数（isTagRanking判定のテスト）', () => {
    it('通常のタグ（"実況プレイ"）の場合は300件制限になる', () => {
      // 通常のタグランキングの場合
      const config = { tag: '実況プレイ' }
      const isTagRanking = !!config.tag && !config.tag.startsWith('custom:')
      
      expect(isTagRanking).toBe(true)
      expect(getDeviceBasedLimit('desktop', isTagRanking)).toBe(300)
      expect(getDeviceBasedLimit('tablet', isTagRanking)).toBe(300)
      expect(getDeviceBasedLimit('mobile', isTagRanking)).toBe(300)
    })

    it('カスタムランキング（"custom:id"）の場合は1000件制限になる', () => {
      // カスタムランキングの場合
      const config = { tag: 'custom:game-ranking-1' }
      const isTagRanking = !!config.tag && !config.tag.startsWith('custom:')
      
      expect(isTagRanking).toBe(false)
      expect(getDeviceBasedLimit('desktop', isTagRanking)).toBe(1000)
      expect(getDeviceBasedLimit('tablet', isTagRanking)).toBe(1000)
      expect(getDeviceBasedLimit('mobile', isTagRanking)).toBe(500)
    })

    it('タグなしの場合は通常のジャンルランキング件数になる', () => {
      // タグなしの場合
      const config = { tag: undefined }
      const isTagRanking = !!config.tag && !config.tag.startsWith('custom:')
      
      expect(isTagRanking).toBe(false)
      expect(getDeviceBasedLimit('desktop', isTagRanking)).toBe(1000)
      expect(getDeviceBasedLimit('tablet', isTagRanking)).toBe(1000)
      expect(getDeviceBasedLimit('mobile', isTagRanking)).toBe(500)
    })

    it('空文字のタグの場合は通常のジャンルランキング件数になる', () => {
      // 空文字タグの場合
      const config = { tag: '' }
      const isTagRanking = !!config.tag && !config.tag.startsWith('custom:')
      
      expect(isTagRanking).toBe(false)
      expect(getDeviceBasedLimit('desktop', isTagRanking)).toBe(1000)
      expect(getDeviceBasedLimit('tablet', isTagRanking)).toBe(1000)
      expect(getDeviceBasedLimit('mobile', isTagRanking)).toBe(500)
    })
  })

  describe('現実的なシナリオテスト', () => {
    it('デスクトップでカスタムランキングを表示する場合は1000件', () => {
      const tag = 'custom:abc123'
      const isTagRanking = !!tag && !tag.startsWith('custom:')
      expect(getDeviceBasedLimit('desktop', isTagRanking)).toBe(1000)
    })

    it('タブレットで通常のタグランキングを表示する場合は300件', () => {
      const tag = 'VOCALOID'
      const isTagRanking = !!tag && !tag.startsWith('custom:')
      expect(getDeviceBasedLimit('tablet', isTagRanking)).toBe(300)
    })

    it('モバイルでジャンル「すべて」を表示する場合は500件', () => {
      const tag = undefined
      const isTagRanking = !!tag && !tag.startsWith('custom:')
      expect(getDeviceBasedLimit('mobile', isTagRanking)).toBe(500)
    })
  })
})