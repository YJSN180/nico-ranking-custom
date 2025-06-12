#!/usr/bin/env npx tsx
// 人気タグが「すべて」しか表示されない問題を調査

import { kv } from '../lib/simple-kv'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
require('dotenv').config()

async function debugPopularTags() {
  console.log('=== 人気タグ問題の調査 ===\n')

  const genres = ['game', 'entertainment', 'technology', 'anime']
  const periods = ['24h', 'hour'] as const

  for (const genre of genres) {
    console.log(`\n[${genre}ジャンル]`)
    
    for (const period of periods) {
      console.log(`\n  ${period}:`)
      
      // 1. 新形式のキーをチェック
      const newKey = `ranking-${genre}-${period}`
      try {
        const data = await kv.get(newKey) as any
        if (data) {
          if (data.items && data.popularTags) {
            console.log(`    ✓ ${newKey}: 人気タグ ${data.popularTags.length}個`)
            console.log(`      タグ例: ${data.popularTags.slice(0, 5).join(', ')}`)
          } else if (Array.isArray(data)) {
            console.log(`    × ${newKey}: 配列形式（人気タグなし）`)
          } else {
            console.log(`    × ${newKey}: 不明な形式`, Object.keys(data))
          }
        } else {
          console.log(`    - ${newKey}: データなし`)
        }
      } catch (error) {
        console.log(`    ! ${newKey}: エラー`, error)
      }
      
      // 2. 旧形式のキーをチェック（24hのみ）
      if (period === '24h') {
        const oldKey = `ranking-${genre}`
        try {
          const data = await kv.get(oldKey) as any
          if (data) {
            if (data.items && data.popularTags) {
              console.log(`    ✓ ${oldKey}: 人気タグ ${data.popularTags.length}個`)
              console.log(`      タグ例: ${data.popularTags.slice(0, 5).join(', ')}`)
            } else if (Array.isArray(data)) {
              console.log(`    × ${oldKey}: 配列形式（人気タグなし）`)
            } else {
              console.log(`    × ${oldKey}: 不明な形式`, Object.keys(data))
            }
          } else {
            console.log(`    - ${oldKey}: データなし`)
          }
        } catch (error) {
          console.log(`    ! ${oldKey}: エラー`, error)
        }
      }
      
      // 3. 人気タグ専用キーをチェック
      const tagKey = `popular-tags:${genre}-${period}`
      try {
        const tags = await kv.get(tagKey) as string[] | null
        if (tags && Array.isArray(tags)) {
          console.log(`    ✓ ${tagKey}: ${tags.length}個`)
          console.log(`      タグ例: ${tags.slice(0, 5).join(', ')}`)
        } else {
          console.log(`    - ${tagKey}: データなし`)
        }
      } catch (error) {
        console.log(`    ! ${tagKey}: エラー`, error)
      }
    }
  }

  // 4. バックアップデータをチェック
  console.log('\n\n[バックアップデータ]')
  const now = new Date()
  const backupHours = [20, 16, 12, 8, 4, 0]
  
  for (const hour of backupHours) {
    if (hour > now.getHours()) continue
    
    const backupKey = `popular-tags-backup:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}:${String(hour).padStart(2, '0')}`
    
    try {
      const backupData = await kv.get(backupKey) as Record<string, string[]> | null
      if (backupData) {
        console.log(`\n  ${backupKey}:`)
        for (const [genre, tags] of Object.entries(backupData)) {
          console.log(`    ${genre}: ${tags.length}個のタグ`)
          if (tags.length > 0) {
            console.log(`      例: ${tags.slice(0, 3).join(', ')}`)
          }
        }
        break // 最新のバックアップのみ表示
      }
    } catch (error) {
      // エラーは無視
    }
  }

  console.log('\n\n=== 調査完了 ===')
}

debugPopularTags().catch(console.error)