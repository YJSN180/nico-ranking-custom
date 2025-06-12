#!/usr/bin/env npx tsx
import 'dotenv/config'
import { kv } from '../lib/simple-kv'
import fs from 'fs'

async function fetchNGList() {
  try {
    const [manual, derived] = await Promise.all([
      kv.get<any>('ng-list-manual').catch(() => null),
      kv.get<string[]>('ng-list-derived').catch(() => null)
    ])
    
    const ngList = {
      videoIds: manual?.videoIds || [],
      videoTitles: manual?.videoTitles || [],
      authorIds: manual?.authorIds || [],
      authorNames: manual?.authorNames || [],
      derivedVideoIds: derived || []
    }
    
    fs.writeFileSync('ng-list.json', JSON.stringify(ngList))
    console.log('NG list fetched successfully')
    console.log(`- Manual entries: ${ngList.videoIds.length} videos, ${ngList.videoTitles.length} titles, ${ngList.authorIds.length} authors`)
    console.log(`- Derived entries: ${ngList.derivedVideoIds.length} videos`)
    // Note: Actual NG list content is not logged for security reasons
  } catch (error) {
    console.error('Failed to fetch NG list:', error)
    // Write empty NG list on error
    fs.writeFileSync('ng-list.json', JSON.stringify({
      videoIds: [],
      videoTitles: [],
      authorIds: [],
      authorNames: [],
      derivedVideoIds: []
    }))
  }
}

fetchNGList()