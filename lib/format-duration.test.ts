import { formatDuration } from './format-utils'

describe('formatDuration', () => {
  // 基本的なケース
  it('should format seconds less than 60', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(59)).toBe('0:59')
  })

  it('should format minutes correctly', () => {
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(61)).toBe('1:01')
    expect(formatDuration(125)).toBe('2:05')
    expect(formatDuration(599)).toBe('9:59')
  })

  it('should format hours correctly', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3661)).toBe('1:01:01')
    expect(formatDuration(7261)).toBe('2:01:01')
    expect(formatDuration(36000)).toBe('10:00:00')
  })

  // エッジケース
  it('should handle edge cases', () => {
    expect(formatDuration(-1)).toBe('0:00')  // 負の値
    expect(formatDuration(-100)).toBe('0:00')
    expect(formatDuration(0)).toBe('0:00')  // ゼロ
  })

  // パディングの確認
  it('should pad seconds and minutes with zeros', () => {
    expect(formatDuration(5)).toBe('0:05')  // 秒のパディング
    expect(formatDuration(65)).toBe('1:05')  // 分がある場合の秒のパディング
    expect(formatDuration(3605)).toBe('1:00:05')  // 時間がある場合の分と秒のパディング
  })

  // 大きな値のテスト
  it('should handle large values', () => {
    expect(formatDuration(86400)).toBe('24:00:00')  // 24時間
    expect(formatDuration(359999)).toBe('99:59:59')  // 99時間59分59秒
  })
})