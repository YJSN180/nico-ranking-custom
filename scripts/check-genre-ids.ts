#!/usr/bin/env tsx

// ニコニコ動画の正しいジャンルIDを確認

const GENRE_MAPPINGS = [
  // 現在使用中のID
  { id: 'music', name: '音楽' },
  { id: 'vocaloid', name: 'VOCALOID' },
  
  // 可能性のある正しいID
  { id: 'music_sound', name: '音楽・サウンド' },
  { id: 'vocaloid_utau', name: 'VOCALOID' },
  { id: 'original_song', name: 'オリジナル曲' },
]

async function checkGenreId(genreId: string) {
  const url = `https://nvapi.nicovideo.jp/v1/ranking/genre/${genreId}?term=24h`
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'Referer': 'https://www.nicovideo.jp/',
      }
    })
    
    console.log(`${genreId}: ${response.status} ${response.ok ? '✓' : '✗'}`)
    
    if (response.ok) {
      const data = await response.json()
      console.log(`  → 取得件数: ${data.data?.items?.length || 0}件`)
    }
    
    return response.ok
  } catch (error) {
    console.log(`${genreId}: エラー - ${error}`)
    return false
  }
}

async function findCorrectGenreIds() {
  console.log('=== ジャンルID確認 ===\n')
  
  for (const genre of GENRE_MAPPINGS) {
    await checkGenreId(genre.id)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log('\n=== 正しいジャンルIDの候補 ===')
  console.log('Webページで確認: https://www.nicovideo.jp/ranking')
}

findCorrectGenreIds()