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
    // Failed to get NG list from KV - returning empty list
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
    await kv.set('ng-list-manual', ngList)
  } catch (error) {
    // Failed to save NG list to KV
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
    // Failed to update derived NG list
    throw error
  }
}

// Get manual NG list
export async function getNGListManual(): Promise<Omit<NGList, 'derivedVideoIds'>> {
  try {
    const manual = await kv.get<Omit<NGList, 'derivedVideoIds'>>('ng-list-manual')
    return manual || {
      videoIds: [],
      videoTitles: [],
      authorIds: [],
      authorNames: []
    }
  } catch (error) {
    console.error('Failed to get manual NG list:', error)
    return {
      videoIds: [],
      videoTitles: [],
      authorIds: [],
      authorNames: []
    }
  }
}

// Set manual NG list
export async function setNGListManual(ngList: Omit<NGList, 'derivedVideoIds'>): Promise<void> {
  return saveServerManualNGList(ngList)
}

// Get derived NG list
export async function getServerDerivedNGList(): Promise<string[]> {
  try {
    const derived = await kv.get<string[]>('ng-list-derived')
    return derived || []
  } catch (error) {
    console.error('Failed to get derived NG list:', error)
    return []
  }
}

// Clear derived NG list
export async function clearServerDerivedNGList(): Promise<void> {
  try {
    await kv.set('ng-list-derived', [])
  } catch (error) {
    console.error('Failed to clear derived NG list:', error)
    throw error
  }
}