#!/usr/bin/env node
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// Script to diagnose which tests are causing shard failures

const SHARD_COUNT = 4 // Original shard count for diagnosis

// Get all test files
const getTestFiles = () => {
  const output = execSync('find . -name "*.test.ts" -o -name "*.test.tsx" | grep -v node_modules | sort', {
    encoding: 'utf8',
    shell: '/bin/bash'
  })
  return output.trim().split('\n').filter(Boolean)
}

// Simulate vitest's shard distribution
const getShardAssignment = (files: string[], shardCount: number) => {
  const shards: Record<number, string[]> = {}
  for (let i = 1; i <= shardCount; i++) {
    shards[i] = []
  }
  
  files.forEach((file, index) => {
    const shardIndex = (index % shardCount) + 1
    shards[shardIndex].push(file)
  })
  
  return shards
}

// Analyze test file characteristics
const analyzeTestFile = (filePath: string) => {
  if (!existsSync(filePath)) return null
  
  const content = readFileSync(filePath, 'utf8')
  const lines = content.split('\n').length
  
  // Look for indicators of heavy tests
  const indicators = {
    lines,
    hasTimeout: content.includes('timeout') || content.includes('testTimeout'),
    hasReactTesting: content.includes('@testing-library/react'),
    hasWorkers: content.includes('workers/') || content.includes('Worker'),
    hasIndexedDB: content.includes('indexedDB') || content.includes('IDB'),
    hasLargeData: content.includes('Array(') && content.includes('000'),
    hasConcurrentTests: content.includes('concurrent') || content.includes('Promise.all'),
    hasMemoryIntensive: content.includes('memory') || content.includes('heap'),
    testCount: (content.match(/\b(test|it)\s*\(/g) || []).length
  }
  
  return indicators
}

// Main diagnostic function
const diagnoseShards = () => {
  console.log('🔍 Diagnosing test shard distribution...\n')
  
  const testFiles = getTestFiles()
  console.log(`Total test files: ${testFiles.length}\n`)
  
  const shardAssignments = getShardAssignment(testFiles, SHARD_COUNT)
  
  // Analyze each shard
  for (const [shardNum, files] of Object.entries(shardAssignments)) {
    console.log(`\n=== SHARD ${shardNum} (${files.length} files) ===`)
    
    let totalLines = 0
    let heavyTests: string[] = []
    let reactTests = 0
    let workerTests = 0
    let totalTestCount = 0
    
    files.forEach(file => {
      const analysis = analyzeTestFile(file)
      if (!analysis) return
      
      totalLines += analysis.lines
      totalTestCount += analysis.testCount
      
      if (analysis.hasReactTesting) reactTests++
      if (analysis.hasWorkers) workerTests++
      
      // Identify potentially heavy tests
      const isHeavy = 
        analysis.lines > 400 ||
        analysis.hasMemoryIntensive ||
        analysis.hasLargeData ||
        (analysis.hasIndexedDB && analysis.testCount > 10) ||
        analysis.testCount > 20
      
      if (isHeavy) {
        heavyTests.push(`  - ${file} (${analysis.lines} lines, ${analysis.testCount} tests)`)
      }
    })
    
    console.log(`Total lines: ${totalLines}`)
    console.log(`Total tests: ${totalTestCount}`)
    console.log(`React tests: ${reactTests}`)
    console.log(`Worker tests: ${workerTests}`)
    
    if (heavyTests.length > 0) {
      console.log(`\nPotentially heavy tests:`)
      heavyTests.forEach(test => console.log(test))
    }
    
    // Highlight problematic shards
    if (shardNum === '2' || shardNum === '4') {
      console.log(`\n⚠️  This shard has been failing in CI!`)
    }
  }
  
  // Recommendations
  console.log('\n\n📋 RECOMMENDATIONS:\n')
  console.log('1. Consider moving heavy tests from failing shards to others')
  console.log('2. Split large test files into smaller ones')
  console.log('3. Add more tests to CI exclusion list if they\'re not critical')
  console.log('4. Reduce shard count to 2 or 3 for better stability')
  console.log('5. Use --bail flag to stop on first failure for faster debugging')
}

// Run diagnostics
diagnoseShards()