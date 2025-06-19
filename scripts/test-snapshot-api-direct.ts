#!/usr/bin/env npx tsx
import 'dotenv/config'

const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

async function testSnapshotAPI() {
  const videoIds = ['sm9', 'sm500873', 'sm1097445', 'sm2057168', 'sm40233256']
  
  console.log('Testing Snapshot API with jsonFilter...')
  console.log('Video IDs:', videoIds)
  
  const jsonFilter = JSON.stringify({
    type: 'or',
    filters: videoIds.map(id => ({
      type: 'equal',
      field: 'contentId',
      value: id
    }))
  })
  
  const params = new URLSearchParams({
    q: '',
    targets: 'title',
    fields: 'contentId,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
    _sort: '-viewCounter',
    _limit: '100',
    jsonFilter: jsonFilter
  })
  
  const url = `${SNAPSHOT_API_URL}?${params}`
  console.log('\nRequest URL:', url.substring(0, 200) + '...')
  console.log('\njsonFilter:', JSON.stringify(JSON.parse(jsonFilter), null, 2))
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/json',
        'Accept-Language': 'ja'
      }
    })
    
    console.log('\nResponse status:', response.status)
    console.log('Response headers:', Object.fromEntries(response.headers.entries()))
    
    if (response.ok) {
      const data = await response.json()
      console.log('\nResponse data:', JSON.stringify(data, null, 2))
      
      if (data.data && Array.isArray(data.data)) {
        console.log(`\nFound ${data.data.length} videos`)
        data.data.forEach((video: any) => {
          console.log(`- ${video.contentId}: ${video.viewCounter} views`)
        })
      }
    } else {
      const text = await response.text()
      console.error('Error response:', text)
    }
  } catch (error) {
    console.error('Request failed:', error)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testSnapshotAPI()
}