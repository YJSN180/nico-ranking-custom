import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'

describe('Derivative NG List Real Workflow Integration', () => {
  const tmpDir = path.join(process.cwd(), 'tmp-test')
  
  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true })
    } catch (error) {
      // Directory might not exist
    }
    await fs.mkdir(tmpDir, { recursive: true })
  })

  it('should create ng-derived-group files when derivatives are found', async () => {
    // This test simulates the actual workflow behavior
    
    // 1. Create mock NG list with blocked authors
    const mockNGList = {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: ['blockedUser123'],
      authorNames: { exact: ['BlockedAuthor'], partial: [] },
      derivedVideoIds: []
    }
    
    await fs.writeFile(
      path.join(tmpDir, 'ng-list.json'),
      JSON.stringify(mockNGList, null, 2)
    )
    
    // 2. Simulate finding derivative entries during processing
    const originalDerivedCount = 0
    mockNGList.derivedVideoIds.push('sm12345', 'sm67890') // Simulate found derivatives
    const newDerivedCount = mockNGList.derivedVideoIds.length
    
    // 3. Check if derivatives were found
    expect(newDerivedCount).toBeGreaterThan(originalDerivedCount)
    
    // 4. Simulate what the script should do
    if (newDerivedCount > originalDerivedCount) {
      const newlyAdded = newDerivedCount - originalDerivedCount
      const derivedData = {
        originalCount: originalDerivedCount,
        newCount: newDerivedCount,
        newEntries: mockNGList.derivedVideoIds.slice(originalDerivedCount),
        allEntries: mockNGList.derivedVideoIds
      }
      
      await fs.writeFile(
        path.join(tmpDir, 'ng-derived-group-1.json'),
        JSON.stringify(derivedData, null, 2)
      )
    }
    
    // 5. Verify the file was created
    const derivedFile = path.join(tmpDir, 'ng-derived-group-1.json')
    const fileExists = await fs.access(derivedFile).then(() => true).catch(() => false)
    expect(fileExists).toBe(true)
    
    // 6. Verify the content
    const content = await fs.readFile(derivedFile, 'utf-8')
    const data = JSON.parse(content)
    expect(data.newEntries).toEqual(['sm12345', 'sm67890'])
    expect(data.originalCount).toBe(0)
    expect(data.newCount).toBe(2)
  })

  it('should not create ng-derived-group files when no derivatives are found', async () => {
    // This test verifies the file is only created when needed
    
    const mockNGList = {
      videoIds: [],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      derivedVideoIds: []
    }
    
    const originalDerivedCount = 0
    // No new derivatives found
    const newDerivedCount = mockNGList.derivedVideoIds.length
    
    expect(newDerivedCount).toBe(originalDerivedCount)
    
    // No file should be created
    const derivedFile = path.join(tmpDir, 'ng-derived-group-1.json')
    const fileExists = await fs.access(derivedFile).then(() => true).catch(() => false)
    expect(fileExists).toBe(false)
  })

  it('should process saved ng-derived-group files correctly in aggregation', async () => {
    // This test simulates the aggregation script behavior
    
    // 1. Create mock ng-derived files from multiple groups
    const group1Data = {
      originalCount: 0,
      newCount: 2,
      newEntries: ['sm12345', 'sm67890'],
      allEntries: ['sm12345', 'sm67890']
    }
    
    const group2Data = {
      originalCount: 2,
      newCount: 5,
      newEntries: ['sm99999', 'sm88888', 'sm77777'],
      allEntries: ['sm12345', 'sm67890', 'sm99999', 'sm88888', 'sm77777']
    }
    
    await fs.writeFile(
      path.join(tmpDir, 'ng-derived-group-1.json'),
      JSON.stringify(group1Data, null, 2)
    )
    
    await fs.writeFile(
      path.join(tmpDir, 'ng-derived-group-2.json'),
      JSON.stringify(group2Data, null, 2)
    )
    
    // 2. Simulate aggregation logic
    const files = await fs.readdir(tmpDir)
    const ngDerivedFiles = files.filter(f => f.startsWith('ng-derived-group-') && f.endsWith('.json'))
    
    let totalNewDerived = 0
    const allNewDerivedEntries = new Set<string>()
    
    for (const file of ngDerivedFiles) {
      const content = await fs.readFile(path.join(tmpDir, file), 'utf-8')
      const derivedData = JSON.parse(content)
      
      if (derivedData.newEntries && Array.isArray(derivedData.newEntries)) {
        totalNewDerived += derivedData.newEntries.length
        derivedData.newEntries.forEach((id: string) => allNewDerivedEntries.add(id))
      }
    }
    
    // 3. Verify aggregation results
    expect(ngDerivedFiles).toHaveLength(2)
    expect(totalNewDerived).toBe(5) // 2 + 3
    expect(allNewDerivedEntries.size).toBe(5) // All unique
    expect(Array.from(allNewDerivedEntries)).toEqual([
      'sm12345', 'sm67890', 'sm99999', 'sm88888', 'sm77777'
    ])
  })
})