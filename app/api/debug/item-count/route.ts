import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const results: any = {}
    const genres = ['all', 'game', 'entertainment', 'music', 'other']
    const periods = ['24h', 'hour']
    
    for (const genre of genres) {
      for (const period of periods) {
        const key = `ranking-${genre}-${period}`
        const data = await kv.get(key) as any
        
        if (data && data.items) {
          results[key] = {
            count: data.items.length,
            hasPopularTags: !!(data.popularTags && data.popularTags.length > 0),
            popularTagsCount: data.popularTags?.length || 0,
            firstItem: data.items[0]?.title || 'なし',
            item100: data.items[99]?.title || 'なし',
            item101: data.items[100]?.title || 'なし',
            lastItem: data.items[data.items.length - 1]?.title || 'なし'
          }
        } else {
          results[key] = { count: 0, error: 'データなし' }
        }
      }
    }
    
    // 最終更新情報
    const updateInfo = await kv.get('last-update-info') as any
    
    return NextResponse.json({
      results,
      updateInfo,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      error: String(error),
      timestamp: new Date().toISOString()
    })
  }
}