import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TagIcon, getTagTypeLabel, getTagTypeDescription } from '../../../components/tag-icon'

describe('TagIcon', () => {
  describe('アイコンレンダリング', () => {
    it('ロックタグアイコンが正しく表示される', () => {
      render(<TagIcon type="locked" />)
      const icon = screen.getByLabelText('ロックタグ')
      expect(icon).toBeInTheDocument()
      expect(icon).toHaveAttribute('fill', '#FFD700') // 金色
    })

    it('ユーザータグアイコンが正しく表示される', () => {
      render(<TagIcon type="user" />)
      const icon = screen.getByLabelText('ユーザータグ')
      expect(icon).toBeInTheDocument()
      expect(icon).toHaveAttribute('fill', '#C0C0C0') // 銀色
    })

    it('両方タグアイコンが正しく表示される', () => {
      render(<TagIcon type="both" />)
      const icon = screen.getByLabelText('両方のタグ')
      expect(icon).toBeInTheDocument()
      expect(icon).toHaveAttribute('fill', '#9370DB') // 紫色
    })
  })

  describe('プロパティ', () => {
    it('カスタムサイズが適用される', () => {
      render(<TagIcon type="locked" size={20} />)
      const icon = screen.getByLabelText('ロックタグ')
      expect(icon).toHaveAttribute('width', '20')
      expect(icon).toHaveAttribute('height', '20')
    })

    it('カスタムカラーが適用される', () => {
      render(<TagIcon type="locked" color="#FF0000" />)
      const icon = screen.getByLabelText('ロックタグ')
      expect(icon).toHaveAttribute('fill', '#FF0000')
    })

    it('カスタムクラス名が適用される', () => {
      render(<TagIcon type="locked" className="custom-class" />)
      const icon = screen.getByLabelText('ロックタグ')
      expect(icon).toHaveClass('custom-class')
    })

    it('デフォルトサイズが14である', () => {
      render(<TagIcon type="locked" />)
      const icon = screen.getByLabelText('ロックタグ')
      expect(icon).toHaveAttribute('width', '14')
      expect(icon).toHaveAttribute('height', '14')
    })
  })

  describe('ヘルパー関数', () => {
    describe('getTagTypeLabel', () => {
      it('正しいラベルを返す', () => {
        expect(getTagTypeLabel('locked')).toBe('ロックタグ')
        expect(getTagTypeLabel('user')).toBe('ユーザータグ')
        expect(getTagTypeLabel('both')).toBe('両方')
      })
    })

    describe('getTagTypeDescription', () => {
      it('正しい説明を返す', () => {
        expect(getTagTypeDescription('locked')).toBe('公式に設定された固定タグ')
        expect(getTagTypeDescription('user')).toBe('ユーザーが追加したタグ')
        expect(getTagTypeDescription('both')).toBe('ロックタグとユーザータグの両方')
      })
    })
  })

  describe('アクセシビリティ', () => {
    it('各タイプに適切なaria-labelが設定される', () => {
      const { rerender } = render(<TagIcon type="locked" />)
      expect(screen.getByLabelText('ロックタグ')).toBeInTheDocument()

      rerender(<TagIcon type="user" />)
      expect(screen.getByLabelText('ユーザータグ')).toBeInTheDocument()

      rerender(<TagIcon type="both" />)
      expect(screen.getByLabelText('両方のタグ')).toBeInTheDocument()
    })
  })
})

describe('TagIcon統合テスト', () => {
  it('ランキングページとNG設定画面で同じアイコンが使用される', () => {
    // ランキングページでの使用例
    const { container: rankingContainer } = render(
      <TagIcon type="locked" size={12} />
    )
    const rankingIcon = rankingContainer.querySelector('svg')

    // NG設定画面での使用例
    const { container: ngContainer } = render(
      <TagIcon type="locked" size={14} />
    )
    const ngIcon = ngContainer.querySelector('svg')

    // 同じパスデータを持つことを確認（サイズは異なってもOK）
    expect(rankingIcon?.querySelector('path')?.getAttribute('d')).toBe(
      ngIcon?.querySelector('path')?.getAttribute('d')
    )
  })

  it('全てのタグタイプで一貫したスタイルが適用される', () => {
    const types: Array<'locked' | 'user' | 'both'> = ['locked', 'user', 'both']
    const icons = types.map(type => {
      const { container } = render(<TagIcon type={type} />)
      return container.querySelector('svg')
    })

    // 全てのアイコンが同じビューボックスを持つ
    icons.forEach(icon => {
      expect(icon).toHaveAttribute('viewBox', '0 0 16 16')
    })
  })
})