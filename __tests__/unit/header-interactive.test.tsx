import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HeaderInteractive } from '@/components/header-interactive'

describe('HeaderInteractive Component', () => {
  it('should render settings button', () => {
    render(<HeaderInteractive isMobile={false} />)
    
    const button = screen.getByRole('button', { name: '設定' })
    expect(button).toBeInTheDocument()
  })

  it('should use correct styles for desktop', () => {
    render(<HeaderInteractive isMobile={false} />)
    
    const button = screen.getByRole('button', { name: '設定' })
    expect(button).toHaveStyle({
      padding: '6px 10px',
      fontSize: '18px',
      right: '16px'
    })
  })

  it('should use correct styles for mobile', () => {
    render(<HeaderInteractive isMobile={true} />)
    
    const button = screen.getByRole('button', { name: '設定' })
    expect(button).toHaveStyle({
      padding: '4px 8px',
      fontSize: '16px',
      right: '12px'
    })
  })

  it('should open settings modal when clicked', () => {
    render(<HeaderInteractive isMobile={false} />)
    
    const button = screen.getByRole('button', { name: '設定' })
    fireEvent.click(button)
    
    // SettingsModalが表示されることを確認
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

})