#!/usr/bin/env tsx

// Create a mapping between ranking-config genres and complete-hybrid-scraper genre IDs

import { GENRES } from '../lib/complete-hybrid-scraper'
import { GENRE_LABELS } from '../types/ranking-config'

// Create the mapping function
export function mapGenreToId(genreKey: string): string {
  // Direct mappings based on our analysis
  const mapping: Record<string, string> = {
    all: 'all',
    entertainment: '8kjl94d9',
    radio: '', // No mapping - need to find the ID
    music_sound: 'wq76qdin',
    dance: '6yuf530c',
    anime: 'zc49b03a',
    game: '4eet3ca4',
    animal: '', // No mapping - need to find the ID
    cooking: 'lq8d5918',
    nature: '24aa8fkw',
    traveling_outdoor: 'k1libcse',
    vehicle: '3d8zlls9',
    sports: '', // No mapping - need to find the ID
    society_politics_news: 'lzicx0y6',
    technology_craft: 'n46kcz9u',
    commentary_lecture: 'v6wdx6p5',
    other: 'ramuboyn',
    r18: 'd2um7mc4',
  }
  
  return mapping[genreKey] || genreKey
}

// Find missing genre IDs by testing actual URLs
async function findMissingGenreIds() {
  console.log('=== FINDING MISSING GENRE IDS ===\n')
  
  // Possible IDs for missing genres based on patterns
  const possibleIds = [
    // For radio
    { genre: 'radio', ids: ['radio', 'xd1tplnh', 'b23k4psr', 'radio_sound'] },
    // For animal
    { genre: 'animal', ids: ['animal', 'kj3b8nvi', 'pet', 'animals', 'dobutsu'] },
    // For sports
    { genre: 'sports', ids: ['sports', 'r8jk2lmn', 'sport', 'supotsu'] },
  ]
  
  for (const test of possibleIds) {
    console.log(`\nTesting IDs for ${test.genre}:`)
    
    for (const id of test.ids) {
      const url = `https://www.nicovideo.jp/ranking/genre/${id}?term=24h`
      
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          }
        })
        
        if (response.ok) {
          const html = await response.text()
          const hasServerResponse = html.includes('name="server-response"')
          
          if (hasServerResponse) {
            console.log(`✅ ${id}: Valid genre ID (Status: ${response.status})`)
            
            // Try to extract the genre label
            const match = html.match(/name="server-response"\s+content="([^"]+)"/)
            if (match) {
              try {
                const decoded = match[1]
                  .replace(/&quot;/g, '"')
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&#39;/g, "'")
                
                const data = JSON.parse(decoded)
                const rankingData = data.data?.response?.$getTeibanRanking?.data
                if (rankingData?.label) {
                  console.log(`   Label: ${rankingData.label}`)
                }
              } catch (e) {
                // Skip parse errors
              }
            }
          } else {
            console.log(`❌ ${id}: No server-response (Status: ${response.status})`)
          }
        } else {
          console.log(`❌ ${id}: HTTP ${response.status}`)
        }
      } catch (error) {
        console.log(`❌ ${id}: Error - ${error}`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }
}

// Test all genre URLs from Niconico
async function testAllNiconicoGenres() {
  console.log('\n=== TESTING ALL KNOWN NICONICO GENRE IDS ===\n')
  
  // Get all unique genre IDs from complete-hybrid-scraper
  const genreIds = Object.values(GENRES).map(g => g.id).filter(id => id !== 'all')
  
  console.log(`Testing ${genreIds.length} genre IDs...\n`)
  
  for (const id of genreIds) {
    const url = `https://www.nicovideo.jp/ranking/genre/${id}?term=24h`
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        }
      })
      
      const genre = Object.entries(GENRES).find(([_, g]) => g.id === id)?.[0]
      const label = GENRES[genre as keyof typeof GENRES]?.label || 'Unknown'
      
      console.log(`${id} (${label}): ${response.status} ${response.ok ? '✅' : '❌'}`)
    } catch (error) {
      console.log(`${id}: Error - ${error}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 300))
  }
}

// Main execution
async function main() {
  // Show current mapping
  console.log('=== CURRENT GENRE MAPPING ===\n')
  Object.entries(GENRE_LABELS).forEach(([key, label]) => {
    const id = mapGenreToId(key)
    console.log(`${key} (${label}) -> ${id || 'NO MAPPING'}`)
  })
  
  // Find missing IDs
  await findMissingGenreIds()
  
  // Test all known IDs
  await testAllNiconicoGenres()
  
  console.log('\n=== RECOMMENDATIONS ===')
  console.log('1. Missing genres (radio, animal, sports) need their actual Niconico genre IDs')
  console.log('2. These IDs should be discovered by examining the actual Niconico website')
  console.log('3. The mapping function should be updated with the correct IDs')
  console.log('4. Consider adding the additional genres from complete-hybrid-scraper to ranking-config')
}

main().catch(console.error)