#!/usr/bin/env tsx

// Comprehensive analysis of genre system state

import { GENRES } from '../lib/complete-hybrid-scraper'
import { GENRE_LABELS } from '../types/ranking-config'
import { POPULAR_TAGS } from '../lib/popular-tags'

console.log('=== GENRE SYSTEM ANALYSIS ===\n')

// 1. Analyze complete-hybrid-scraper genres
console.log('1. GENRES from complete-hybrid-scraper.ts:')
console.log('Total genres:', Object.keys(GENRES).length)
Object.entries(GENRES).forEach(([key, value]) => {
  console.log(`  ${key}: ${value.id} (${value.label})`)
})

// 2. Analyze ranking-config genres
console.log('\n2. GENRE_LABELS from ranking-config.ts:')
console.log('Total genres:', Object.keys(GENRE_LABELS).length)
Object.entries(GENRE_LABELS).forEach(([key, value]) => {
  console.log(`  ${key}: ${value}`)
})

// 3. Analyze popular tags
console.log('\n3. POPULAR_TAGS from popular-tags.ts:')
console.log('Total genres with tags:', Object.keys(POPULAR_TAGS).length)
Object.entries(POPULAR_TAGS).forEach(([key, value]) => {
  console.log(`  ${key}: ${value.length} tags`)
})

// 4. Find mismatches
console.log('\n4. GENRE MAPPING ANALYSIS:')

console.log('\nGenres in ranking-config but not in complete-hybrid-scraper:')
Object.keys(GENRE_LABELS).forEach(key => {
  if (!Object.keys(GENRES).includes(key)) {
    console.log(`  - ${key} (${GENRE_LABELS[key as keyof typeof GENRE_LABELS]})`)
  }
})

console.log('\nGenres in complete-hybrid-scraper but not in ranking-config:')
Object.keys(GENRES).forEach(key => {
  if (!Object.keys(GENRE_LABELS).includes(key)) {
    console.log(`  - ${key} (${GENRES[key as keyof typeof GENRES].label})`)
  }
})

// 5. Create mapping table
console.log('\n5. PROPOSED GENRE ID MAPPING:')
console.log('\nranking-config key -> complete-hybrid-scraper ID:')

// Map based on label similarity
const mappings: Record<string, string> = {
  all: 'all',
  entertainment: '8kjl94d9', // エンタメ
  radio: '', // No direct match
  music_sound: 'wq76qdin', // 音楽
  dance: '6yuf530c', // 踊ってみた
  anime: 'zc49b03a', // アニメ
  game: '4eet3ca4', // ゲーム
  animal: '', // No direct match in GENRES
  cooking: 'lq8d5918', // 料理
  nature: '24aa8fkw', // 自然
  traveling_outdoor: 'k1libcse', // 旅行・アウトドア
  vehicle: '3d8zlls9', // 乗り物
  sports: '', // No direct match
  society_politics_news: 'lzicx0y6', // 社会・政治・時事
  technology_craft: 'n46kcz9u', // 技術・工作
  commentary_lecture: 'v6wdx6p5', // 解説・講座
  other: 'ramuboyn', // その他
  r18: 'd2um7mc4', // 例のソレ (excluded in current implementation)
}

Object.entries(mappings).forEach(([key, id]) => {
  const label = GENRE_LABELS[key as keyof typeof GENRE_LABELS]
  const scraperGenre = id ? GENRES[Object.keys(GENRES).find(k => GENRES[k as keyof typeof GENRES].id === id) as keyof typeof GENRES] : null
  console.log(`  ${key} (${label}) -> ${id || 'NO MAPPING'} ${scraperGenre ? `(${scraperGenre.label})` : ''}`)
})

// 6. Additional genres in complete-hybrid-scraper
console.log('\n6. ADDITIONAL GENRES IN COMPLETE-HYBRID-SCRAPER:')
const additionalGenres = ['vocaloid', 'vtuber', 'sing', 'play', 'mmd']
additionalGenres.forEach(key => {
  if (GENRES[key as keyof typeof GENRES]) {
    const genre = GENRES[key as keyof typeof GENRES]
    console.log(`  ${key}: ${genre.id} (${genre.label})`)
  }
})

console.log('\n=== SUMMARY ===')
console.log('1. There are two separate genre systems in the codebase')
console.log('2. complete-hybrid-scraper uses actual Niconico genre IDs (e.g., "4eet3ca4" for game)')
console.log('3. ranking-config uses human-readable keys (e.g., "game")')
console.log('4. Some genres exist in one system but not the other')
console.log('5. A mapping function is needed to convert between the two systems')