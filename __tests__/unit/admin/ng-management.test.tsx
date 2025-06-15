import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NGManagementPage from '@/app/admin/ng-management/page'

// Mock the fetch API
global.fetch = vi.fn()

describe('NG Management Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock successful auth cookie
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'admin-auth=valid'
    })
  })

  describe('Manual NG List', () => {
    it('should display manual NG list items', async () => {
      const mockNGList = {
        videoIds: ['sm123', 'sm456'],
        videoTitles: ['Test Video 1', 'Test Video 2'],
        authorIds: ['author1', 'author2'],
        authorNames: ['Author 1', 'Author 2']
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockNGList
      })

      render(<NGManagementPage />)

      await waitFor(() => {
        expect(screen.getByText('Test Video 1')).toBeInTheDocument()
        expect(screen.getByText('Test Video 2')).toBeInTheDocument()
        expect(screen.getByText('Author 1')).toBeInTheDocument()
        expect(screen.getByText('Author 2')).toBeInTheDocument()
      })
    })

    it('should allow selecting items with checkboxes', async () => {
      const mockNGList = {
        videoIds: ['sm123'],
        videoTitles: ['Test Video'],
        authorIds: ['author1'],
        authorNames: ['Test Author']
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockNGList
      })

      render(<NGManagementPage />)

      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox', { name: /動画ID: sm123/i })
        expect(checkbox).not.toBeChecked()
        
        fireEvent.click(checkbox)
        expect(checkbox).toBeChecked()
      })
    })

    it('should delete selected items', async () => {
      const mockNGList = {
        videoIds: ['sm123', 'sm456'],
        videoTitles: ['Video 1', 'Video 2'],
        authorIds: ['author1', 'author2'],
        authorNames: ['Author 1', 'Author 2']
      }

      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockNGList
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        })

      render(<NGManagementPage />)

      await waitFor(() => {
        const checkbox1 = screen.getByRole('checkbox', { name: /動画ID: sm123/i })
        fireEvent.click(checkbox1)
      })

      const deleteButton = screen.getByText('選択した項目を削除')
      fireEvent.click(deleteButton)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/admin/ng-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoIds: ['sm456'],
            videoTitles: ['Video 2'],
            authorIds: ['author2'],
            authorNames: ['Author 2']
          })
        })
      })
    })
  })

  describe('Derived NG List', () => {
    it('should display derived NG list', async () => {
      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            videoIds: [],
            videoTitles: [],
            authorIds: [],
            authorNames: []
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ['sm789', 'sm101112']
        })

      render(<NGManagementPage />)

      await waitFor(() => {
        expect(screen.getByText(/派生NGリスト.*2件/)).toBeInTheDocument()
        expect(screen.getByText('sm789')).toBeInTheDocument()
        expect(screen.getByText('sm101112')).toBeInTheDocument()
      })
    })

    it('should clear derived NG list', async () => {
      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            videoIds: [],
            videoTitles: [],
            authorIds: [],
            authorNames: []
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ['sm789']
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        })

      render(<NGManagementPage />)

      await waitFor(() => {
        const clearButton = screen.getByText('派生リストをクリア')
        fireEvent.click(clearButton)
      })

      // Confirm dialog
      fireEvent.click(screen.getByText('クリア'))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/admin/ng-list/derived', {
          method: 'DELETE'
        })
      })
    })
  })

  describe('Theme Support', () => {
    it('should apply correct theme classes', () => {
      // Mock localStorage for theme
      const mockGetItem = vi.fn().mockReturnValue('dark')
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: mockGetItem,
          setItem: vi.fn(),
          removeItem: vi.fn(),
          clear: vi.fn()
        },
        writable: true
      })

      render(<NGManagementPage />)

      const container = screen.getByTestId('ng-management-container')
      expect(container.className).toContain('dark')
    })
  })

  describe('Error Handling', () => {
    it('should handle fetch errors gracefully', async () => {
      ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

      render(<NGManagementPage />)

      await waitFor(() => {
        expect(screen.getByText('データの読み込みに失敗しました')).toBeInTheDocument()
      })
    })

    it('should handle unauthorized access', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' })
      })

      render(<NGManagementPage />)

      await waitFor(() => {
        expect(screen.getByText('認証が必要です')).toBeInTheDocument()
      })
    })
  })
})