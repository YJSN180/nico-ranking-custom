#!/usr/bin/env npx tsx
import 'dotenv/config'
import { kv } from '../lib/simple-kv'
import * as fs from 'fs'

// Migrate legacy NG list to new structure
function migrateLegacyNGList(data: any) {
  // If already in new format, return as-is
  if (data && data.videoTitles && typeof data.videoTitles === 'object' && Array.isArray(data.videoTitles.exact)) {
    return data;
  }
  
  // Convert legacy format to new structure
  return {
    videoIds: data?.videoIds || [],
    videoTitles: {
      exact: data?.videoTitles || [],
      partial: []
    },
    authorIds: data?.authorIds || [],
    authorNames: {
      exact: data?.authorNames || [],
      partial: []
    },
    derivedVideoIds: data?.derivedVideoIds || []
  };
}

async function fetchNGList() {
  try {
    const [manual, derived] = await Promise.all([
      kv.get<any>('ng-list-manual').catch(() => null),
      kv.get<string[]>('ng-list-derived').catch(() => null)
    ])
    
    const legacyData = {
      videoIds: manual?.videoIds || [],
      videoTitles: manual?.videoTitles || [],
      authorIds: manual?.authorIds || [],
      authorNames: manual?.authorNames || [],
      derivedVideoIds: derived || []
    };
    
    const ngList = migrateLegacyNGList(legacyData);
    
    fs.writeFileSync('ng-list.json', JSON.stringify(ngList))
    console.log('NG list fetched successfully')
    console.log(`- Manual entries: ${ngList.videoIds.length} videos, ${ngList.videoTitles.exact.length + ngList.videoTitles.partial.length} titles, ${ngList.authorIds.length} author IDs, ${ngList.authorNames.exact.length + ngList.authorNames.partial.length} author names`)
    console.log(`- Derived entries: ${ngList.derivedVideoIds.length} videos`)
    // Note: Actual NG list content is not logged for security reasons
  } catch (error) {
    console.error('Failed to fetch NG list:', error)
    // Write empty NG list on error
    fs.writeFileSync('ng-list.json', JSON.stringify({
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      derivedVideoIds: []
    }))
  }
}

fetchNGList()