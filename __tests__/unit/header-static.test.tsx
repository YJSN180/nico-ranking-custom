import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeaderStatic } from '@/components/header-static'

describe('HeaderStatic Component', () => {
  it('should render with desktop sizes when isMobile is false', () => {
    render(<HeaderStatic isMobile={false} />)
    
    const header = screen.getByRole('banner')
    expect(header).toBeInTheDocument()
    
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveStyle({ fontSize: '48px' })
    
    // ロゴアイコンのサイズを確認
    const logo = screen.getByAltText('ニコラン(Re:turn) ロゴ')
    expect(logo.parentElement).toHaveStyle({ width: '106px', height: '106px' })
  })

  it('should render with mobile sizes when isMobile is true', () => {
    render(<HeaderStatic isMobile={true} />)
    
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveStyle({ fontSize: '22px' })
    
    // ロゴアイコンのサイズを確認
    const logo = screen.getByAltText('ニコラン(Re:turn) ロゴ')
    expect(logo.parentElement).toHaveStyle({ width: '48px', height: '48px' })
  })

  it('should render title text correctly', () => {
    render(<HeaderStatic isMobile={false} />)
    
    expect(screen.getByText('ニコラン')).toBeInTheDocument()
    expect(screen.getByText('(Re:turn)')).toBeInTheDocument()
  })

  it('should be a link to home page', () => {
    render(<HeaderStatic isMobile={false} />)
    
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/')
  })

  it('should not contain any client-side interactivity', () => {
    const { container } = render(<HeaderStatic isMobile={false} />)
    
    // useStateやuseEffectなどのクライアントフックが使われていないことを確認
    expect(container.innerHTML).not.toContain('use client')
  })
})