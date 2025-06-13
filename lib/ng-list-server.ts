// Server-side NG list management using Cloudflare KV
import { kv } from './simple-kv'
import type { NGList } from '@/types/ng-list'

// Get NG list from KV
export async function getServerNGList(): Promise<NGList> {
  try {
    const [manual, derived] = await Promise.all([
      kv.get<Omit<NGList, 'derivedVideoIds'>>('ng-list-manual'),
      kv.get<string[]>('ng-list-derived')
    ])
    
    return {
      videoIds: manual?.videoIds || [],
      videoTitles: manual?.videoTitles || [],
      authorIds: manual?.authorIds || [],
      authorNames: manual?.authorNames || [],
      derivedVideoIds: derived || []
    }
  } catch (error) {
    console.error('Failed to get NG list from KV:', error)
    return {
      videoIds: [],
      videoTitles: [],
      authorIds: [],
      authorNames: [],
      derivedVideoIds: []
    }
  }
}

// Save manual NG list to KV
export async function saveServerManualNGList(ngList: Omit<NGList, 'derivedVideoIds'>): Promise<void> {
  try {
    console.log('Saving NG list to KV:', {
      videoIds: ngList.videoIds.length,
      videoTitles: ngList.videoTitles.length,
      authorIds: ngList.authorIds.length,
      authorNames: ngList.authorNames.length
    })
    await kv.set('ng-list-manual', ngList)
    console.log('NG list saved successfully to KV')
  } catch (error) {
    console.error('Failed to save NG list to KV:', error)
    throw error
  }
}

// Add to derived NG list in KV
export async function addToServerDerivedNGList(videoIds: string[]): Promise<void> {
  if (videoIds.length === 0) return
  
  try {
    const current = await kv.get<string[]>('ng-list-derived') || []
    const newSet = new Set([...current, ...videoIds])
    await kv.set('ng-list-derived', Array.from(newSet))
  } catch (error) {
    console.error('Failed to update derived NG list:', error)
    throw error
  }
}