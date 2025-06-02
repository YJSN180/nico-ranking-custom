#!/usr/bin/env node

import { kv } from '@vercel/kv'

async function checkCachedTagData() {
  console.log('=== キャッシュされたタグ別ランキングデータの確認 ===\n')
  
  const genre = 'other'
  const period = '24h'
  const tags = ['ゲーム', 'アニメ', '音楽', '描いてみた', '歌ってみた']
  
  for (const tag of tags) {
    const key = `ranking-${genre}-${period}-tag-${encodeURIComponent(tag)}`
    console.log(`\nタグ「${tag}」のキャッシュキー: ${key}`)
    
    try {
      const data = await kv.get(key) as any
      
      if (!data) {
        console.log('- データなし')
        continue
      }
      
      if (Array.isArray(data)) {
        console.log(`- データ形式: 配列`)
        console.log(`- 件数: ${data.length}件`)
        
        if (data.length > 0) {
          console.log(`- 最初のアイテム: Rank ${data[0].rank} - ${data[0].title}`)
          console.log(`- 最後のアイテム: Rank ${data[data.length - 1].rank} - ${data[data.length - 1].title}`)
          
          // ランク番号の連続性チェック
          let isConsecutive = true
          for (let i = 1; i < data.length; i++) {
            if (data[i].rank !== data[i - 1].rank + 1) {
              isConsecutive = false
              break
            }
          }
          console.log(`- ランク番号の連続性: ${isConsecutive ? '✓' : '✗'}`)
          
          // 重複チェック
          const ids = data.map((item: any) => item.id)
          const uniqueIds = new Set(ids)
          console.log(`- 重複チェック: ${ids.length}件中${uniqueIds.size}件がユニーク`)
        }
      } else {
        console.log(`- データ形式: ${typeof data}`)
        console.log(`- データ: ${JSON.stringify(data).substring(0, 100)}...`)
      }
    } catch (error) {
      console.error(`- エラー: ${error}`)
    }
  }
  
  // KVの全キーをチェック
  console.log('\n=== KV内のタグ関連キー一覧 ===')
  try {
    const keys = await kv.keys('ranking-other-*-tag-*')
    console.log(`タグ関連キーの総数: ${keys.length}件`)
    
    if (keys.length > 0) {
      console.log('\n最初の10件:')
      keys.slice(0, 10).forEach(key => {
        console.log(`- ${key}`)
      })
    }
  } catch (error) {
    console.error('キー一覧の取得に失敗:', error)
  }
}

// スクリプトを実行
checkCachedTagData().catch(console.error)