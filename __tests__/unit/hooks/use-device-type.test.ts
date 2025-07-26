import { renderHook } from '@testing-library/react'
import { useDeviceType, getDeviceBasedLimit } from '@/hooks/use-device-type'

// window.innerWidthをモック
const mockInnerWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
}

describe('useDeviceType', () => {
  describe('デバイスタイプの判定', () => {
    it('640px以下の場合はmobileを返す', () => {
      mockInnerWidth(375)
      const { result } = renderHook(() => useDeviceType())
      expect(result.current).toBe('mobile')
    })

    it('640pxちょうどの場合もmobileを返す', () => {
      mockInnerWidth(640)
      const { result } = renderHook(() => useDeviceType())
      expect(result.current).toBe('mobile')
    })

    it('641px〜1024pxの場合はtabletを返す', () => {
      mockInnerWidth(768)
      const { result } = renderHook(() => useDeviceType())
      expect(result.current).toBe('tablet')
    })

    it('1024pxちょうどの場合もtabletを返す', () => {
      mockInnerWidth(1024)
      const { result } = renderHook(() => useDeviceType())
      expect(result.current).toBe('tablet')
    })

    it('1025px以上の場合はdesktopを返す', () => {
      mockInnerWidth(1920)
      const { result } = renderHook(() => useDeviceType())
      expect(result.current).toBe('desktop')
    })
  })
})

describe('getDeviceBasedLimit', () => {
  describe('ジャンル別ランキング（isTagRanking=false）', () => {
    it('mobileの場合は500件を返す', () => {
      expect(getDeviceBasedLimit('mobile', false)).toBe(500)
    })

    it('tabletの場合は1000件を返す', () => {
      expect(getDeviceBasedLimit('tablet', false)).toBe(1000)
    })

    it('desktopの場合は1000件を返す', () => {
      expect(getDeviceBasedLimit('desktop', false)).toBe(1000)
    })
  })

  describe('タグ別ランキング（isTagRanking=true）', () => {
    it('全デバイスで300件を返す', () => {
      expect(getDeviceBasedLimit('mobile', true)).toBe(300)
      expect(getDeviceBasedLimit('tablet', true)).toBe(300)
      expect(getDeviceBasedLimit('desktop', true)).toBe(300)
    })
  })
})