import { GET } from '@/app/api/ranking/route'
import { NextRequest, NextResponse } from 'next/server'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// NextResponseをモック
vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    redirect: vi.fn((url: string, status: number) => ({
      url,
      status,
      type: 'redirect'
    }))
  }
}))

describe('API Ranking Route Redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // デフォルトの環境変数を設定
    process.env.NEXT_PUBLIC_API_GATEWAY_URL = 'https://nico-rank.com'
  })

  it('/api/rankingへのリクエストをCloudflare Workerにリダイレクトする', async () => {
    const mockRequest = {
      url: 'https://www.nico-rank.com/api/ranking?genre=all&period=24h',
      headers: {
        get: vi.fn((name) => {
          if (name === 'host') return 'www.nico-rank.com'
          return null
        })
      }
    } as unknown as NextRequest

    const response = await GET(mockRequest)

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      'https://nico-rank.com/api/ranking?genre=all&period=24h',
      301
    )
    expect(response).toEqual({
      url: 'https://nico-rank.com/api/ranking?genre=all&period=24h',
      status: 301,
      type: 'redirect'
    })
  })

  it('クエリパラメータを保持してリダイレクトする', async () => {
    const mockRequest = {
      url: 'https://www.nico-rank.com/api/ranking?genre=game&period=hour&tag=実況プレイ動画',
      headers: {
        get: vi.fn((name) => {
          if (name === 'host') return 'www.nico-rank.com'
          return null
        })
      }
    } as unknown as NextRequest

    await GET(mockRequest)

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      'https://nico-rank.com/api/ranking?genre=game&period=hour&tag=%E5%AE%9F%E6%B3%81%E3%83%97%E3%83%AC%E3%82%A4%E5%8B%95%E7%94%BB',
      301
    )
  })

  it('環境変数が設定されていない場合はデフォルトURLを使用する', async () => {
    delete process.env.NEXT_PUBLIC_API_GATEWAY_URL

    const mockRequest = {
      url: 'https://www.nico-rank.com/api/ranking',
      headers: {
        get: vi.fn((name) => {
          if (name === 'host') return 'www.nico-rank.com'
          return null
        })
      }
    } as unknown as NextRequest

    await GET(mockRequest)

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      'https://nico-rank.com/api/ranking',
      301
    )
  })

  it('パラメータなしのリクエストもリダイレクトする', async () => {
    const mockRequest = {
      url: 'https://www.nico-rank.com/api/ranking',
      headers: {
        get: vi.fn((name) => {
          if (name === 'host') return 'www.nico-rank.com'
          return null
        })
      }
    } as unknown as NextRequest

    await GET(mockRequest)

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      'https://nico-rank.com/api/ranking',
      301
    )
  })

  it('301 Moved Permanentlyステータスを返す', async () => {
    const mockRequest = {
      url: 'https://www.nico-rank.com/api/ranking?genre=all',
      headers: {
        get: vi.fn((name) => {
          if (name === 'host') return 'www.nico-rank.com'
          return null
        })
      }
    } as unknown as NextRequest

    const response = await GET(mockRequest)

    expect(response.status).toBe(301)
  })
})
