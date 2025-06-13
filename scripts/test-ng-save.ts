#!/usr/bin/env npx tsx
import 'dotenv/config'
import { getServerNGList, saveServerManualNGList } from '../lib/ng-list-server'

async function testNGSave() {
  console.log('=== Testing NG List Save/Load ===\n')
  
  try {
    // 1. Get current NG list
    console.log('1. Getting current NG list...')
    const currentList = await getServerNGList()
    console.log('Current NG list:', {
      videoIds: currentList.videoIds.length,
      videoTitles: currentList.videoTitles.length,
      authorIds: currentList.authorIds.length,
      authorNames: currentList.authorNames.length,
      derivedVideoIds: currentList.derivedVideoIds.length
    })
    
    // 2. Save test data
    console.log('\n2. Saving test NG list...')
    const testList = {
      videoIds: ['test123', 'test456'],
      videoTitles: ['テスト動画', 'NG動画'],
      authorIds: ['author1', 'author2'],
      authorNames: ['テスト投稿者', 'NG投稿者']
    }
    
    await saveServerManualNGList(testList)
    console.log('Test NG list saved')
    
    // 3. Retrieve and verify
    console.log('\n3. Retrieving saved NG list...')
    const savedList = await getServerNGList()
    console.log('Retrieved NG list:', {
      videoIds: savedList.videoIds,
      videoTitles: savedList.videoTitles,
      authorIds: savedList.authorIds,
      authorNames: savedList.authorNames
    })
    
    // 4. Verify
    console.log('\n4. Verification:')
    const verified = 
      JSON.stringify(savedList.videoIds) === JSON.stringify(testList.videoIds) &&
      JSON.stringify(savedList.videoTitles) === JSON.stringify(testList.videoTitles) &&
      JSON.stringify(savedList.authorIds) === JSON.stringify(testList.authorIds) &&
      JSON.stringify(savedList.authorNames) === JSON.stringify(testList.authorNames)
    
    console.log('Save/Load test:', verified ? '✅ PASSED' : '❌ FAILED')
    
    if (!verified) {
      console.log('\nExpected:', testList)
      console.log('Got:', {
        videoIds: savedList.videoIds,
        videoTitles: savedList.videoTitles,
        authorIds: savedList.authorIds,
        authorNames: savedList.authorNames
      })
    }
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

if (require.main === module) {
  testNGSave()
}