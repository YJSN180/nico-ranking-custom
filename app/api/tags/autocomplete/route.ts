import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * タグオートコンプリートAPI（Next.js版）
 * ローカル開発環境用のAPIエンドポイント
 * 実際のタグ累積データを使用
 */

interface TagAccumulationData {
  tags: string[]
  metadata: {
    version: number
    lastUpdated: string
    totalUniqueTags: number
    lastAccumulationSource: string
    weeklyUpdateCount?: number
  }
}

// タグ累積データをメモリにキャッシュ（開発時のパフォーマンス向上）
let cachedTagData: string[] | null = null
let cacheTimestamp = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5分間キャッシュ

function loadTagData(): string[] {
  const now = Date.now()
  
  // キャッシュが有効な場合はそれを使用
  if (cachedTagData && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedTagData
  }
  
  try {
    // data/tag-accumulation.jsonから読み込み
    const dataPath = join(process.cwd(), 'data', 'tag-accumulation.json')
    if (existsSync(dataPath)) {
      const data = JSON.parse(readFileSync(dataPath, 'utf-8')) as TagAccumulationData
      cachedTagData = data.tags || []
      cacheTimestamp = now
      return cachedTagData
    }
  } catch (error) {
    console.error('[Tag Autocomplete] Failed to load tag data:', error)
  }
  
  // フォールバック: 空の配列を返す
  console.warn('[Tag Autocomplete] No tag data found, returning empty array')
  return []
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const limit = parseInt(searchParams.get('limit') || '10')

    // クエリが空または2文字未満の場合は空の結果を返す
    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        query,
        suggestions: [],
        metadata: {
          total: 0,
          source: 'query-too-short'
        }
      })
    }

    // タグデータを読み込み
    const tagData = loadTagData()
    
    // プレフィックス検索を実行（大文字小文字を区別しない）
    const lowerQuery = query.toLowerCase()
    const suggestions = tagData
      .filter(tag => tag.toLowerCase().includes(lowerQuery))
      .slice(0, limit)

    // レスポンスを構築
    const response = {
      query,
      suggestions,
      metadata: {
        total: suggestions.length,
        maxResults: limit,
        source: 'next-api-tagdata',
        lastUpdated: new Date().toISOString(),
        totalUniqueTags: tagData.length
      }
    }

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5分キャッシュ
      }
    })

  } catch (error) {
    console.error('Tag autocomplete error:', error)
    return NextResponse.json({
      query: '',
      suggestions: [],
      metadata: {
        total: 0,
        source: 'error',
        error: 'Internal server error'
      }
    }, {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    })
  }
}