import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Pagination from '@/components/pagination'

afterEach(cleanup)
const props = {
  currentPage: 500,
  totalPages: 2000,
  totalItems: 250000,
  itemsPerPage: 50,
}

describe('検索用ページ移動', () => {
  it('番号入力だけでは取得せず、確定時に移動する', () => {
    const change = vi.fn()
    render(
      <Pagination {...props} enableQuickNavigation onPageChange={change} />,
    )
    fireEvent.change(screen.getByLabelText('移動先のページ番号'), {
      target: { value: '1234' },
    })
    expect(change).not.toHaveBeenCalled()
    fireEvent.submit(
      screen
        .getByRole('button', { name: '移動', exact: true })
        .closest('form')!,
    )
    expect(change).toHaveBeenCalledExactlyOnceWith(1234)
  })

  it.each(['', '0', '2001', '-1', '1.5', '1e3', 'abc', '9999999999999999999'])(
    '不正な番号 %s は問い合わせない',
    (value) => {
      const change = vi.fn()
      render(
        <Pagination {...props} enableQuickNavigation onPageChange={change} />,
      )
      const input = screen.getByLabelText('移動先のページ番号')
      fireEvent.change(input, { target: { value } })
      fireEvent.submit(input.closest('form')!)
      expect(change).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent('1〜2,000の整数')
      expect(input).toHaveFocus()
    },
  )

  it('同じページには再問い合わせせず、URLに合わせて入力を同期する', () => {
    const change = vi.fn()
    const { rerender } = render(
      <Pagination {...props} enableQuickNavigation onPageChange={change} />,
    )
    fireEvent.submit(
      screen.getByLabelText('移動先のページ番号').closest('form')!,
    )
    expect(change).not.toHaveBeenCalled()
    rerender(
      <Pagination
        {...props}
        currentPage={10}
        totalPages={20}
        enableQuickNavigation
        onPageChange={change}
      />,
    )
    expect(screen.getByLabelText('移動先のページ番号')).toHaveValue('10')
  })

  it('10ページ移動は端を越えず、端の操作は無効になる', () => {
    const change = vi.fn()
    const { rerender } = render(
      <Pagination
        {...props}
        currentPage={5}
        enableQuickNavigation
        onPageChange={change}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '10ページ前' }))
    expect(change).toHaveBeenLastCalledWith(1)
    rerender(
      <Pagination
        {...props}
        currentPage={1995}
        enableQuickNavigation
        onPageChange={change}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '10ページ先' }))
    expect(change).toHaveBeenLastCalledWith(2000)
    rerender(
      <Pagination
        {...props}
        currentPage={2000}
        enableQuickNavigation
        onPageChange={change}
      />,
    )
    expect(screen.getByRole('button', { name: '10ページ先' })).toBeDisabled()
    rerender(
      <Pagination
        {...props}
        currentPage={1}
        enableQuickNavigation
        onPageChange={change}
      />,
    )
    expect(screen.getByRole('button', { name: '10ページ前' })).toBeDisabled()
  })

  it('モバイルのページ表示から入力欄へフォーカスする', () => {
    render(
      <Pagination {...props} enableQuickNavigation onPageChange={vi.fn()} />,
    )
    fireEvent.click(screen.getByTestId('page-summary'))
    expect(screen.getByLabelText('移動先のページ番号')).toHaveFocus()
  })

  it('ランキングの既定表示には追加の操作を出さない', () => {
    render(<Pagination {...props} onPageChange={vi.fn()} />)
    expect(screen.queryByLabelText('移動先のページ番号')).toBeNull()
    expect(screen.queryByRole('button', { name: '10ページ先' })).toBeNull()
  })
})


describe('1ページの件数表示', () => {
  it.each([0, 1, 50])('検索の上部では%i件でも表示し、不要な移動ボタンを出さない', (count) => {
    render(<Pagination currentPage={1} totalPages={1} totalItems={count} itemsPerPage={50} showSinglePageSummary onPageChange={vi.fn()} />)
    expect(screen.getByText(`${count === 0 ? 0 : 1}〜${count}件を表示 (全${count}件中)`)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
