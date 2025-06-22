#!/usr/bin/env tsx

/**
 * R2書き込み統計をモニタリング
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const execAsync = promisify(exec)

interface WriteStats {
  timestamp: string
  totalFiles: number
  uploaded: number
  skipped: number
  reductionPercent: number
}

const STATS_FILE = 'r2-write-stats.json'

async function getLatestWorkflowLogs(): Promise<string | null> {
  try {
    // 最新のワークフロー実行IDを取得
    const { stdout: runList } = await execAsync(
      'gh run list --workflow "Update Nico Ranking Data (Parallel)" --limit 1 --json databaseId'
    )
    const runs = JSON.parse(runList)
    if (runs.length === 0) return null
    
    const runId = runs[0].databaseId
    
    // ログを取得
    const { stdout: logs } = await execAsync(`gh run view ${runId} --log`)
    return logs
  } catch (error) {
    console.error('Error fetching workflow logs:', error)
    return null
  }
}

function parseStatsFromLogs(logs: string): WriteStats | null {
  const lines = logs.split('\n')
  
  let totalFiles = 0
  let uploaded = 0
  let skipped = 0
  let reductionPercent = 0
  
  for (const line of lines) {
    if (line.includes('Total files processed:')) {
      totalFiles = parseInt(line.match(/(\d+)/)?.[1] || '0')
    } else if (line.includes('Files uploaded:')) {
      uploaded = parseInt(line.match(/(\d+)/)?.[1] || '0')
    } else if (line.includes('Files skipped')) {
      skipped = parseInt(line.match(/(\d+)/)?.[1] || '0')
    } else if (line.includes('Upload reduction:')) {
      reductionPercent = parseFloat(line.match(/([\d.]+)%/)?.[1] || '0')
    }
  }
  
  if (totalFiles === 0) return null
  
  return {
    timestamp: new Date().toISOString(),
    totalFiles,
    uploaded,
    skipped,
    reductionPercent
  }
}

function loadStats(): WriteStats[] {
  if (!existsSync(STATS_FILE)) return []
  return JSON.parse(readFileSync(STATS_FILE, 'utf-8'))
}

function saveStats(stats: WriteStats[]) {
  writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2))
}

async function monitor() {
  console.log('📊 R2 Write Statistics Monitor')
  console.log('=============================\n')
  
  const logs = await getLatestWorkflowLogs()
  if (!logs) {
    console.error('❌ Could not fetch workflow logs')
    return
  }
  
  const newStats = parseStatsFromLogs(logs)
  if (!newStats) {
    console.log('⚠️  No statistics found in logs (might be using old code)')
    return
  }
  
  // 統計を保存
  const allStats = loadStats()
  allStats.push(newStats)
  if (allStats.length > 100) allStats.shift() // 最大100件保持
  saveStats(allStats)
  
  // 現在の統計を表示
  console.log('📈 Latest Write Statistics:')
  console.log(`  Timestamp: ${newStats.timestamp}`)
  console.log(`  Total Files: ${newStats.totalFiles}`)
  console.log(`  Uploaded: ${newStats.uploaded}`)
  console.log(`  Skipped: ${newStats.skipped}`)
  console.log(`  Reduction: ${newStats.reductionPercent}%`)
  
  // コスト削減の計算
  const monthlyWrites = newStats.uploaded * 48 * 30 // 1日48回 × 30日
  const originalWrites = newStats.totalFiles * 48 * 30
  const savedWrites = originalWrites - monthlyWrites
  
  console.log('\n💰 Monthly Cost Impact:')
  console.log(`  Original writes: ${originalWrites.toLocaleString()} (${(originalWrites / 1000000 * 100).toFixed(0)}% of free tier)`)
  console.log(`  Optimized writes: ${monthlyWrites.toLocaleString()} (${(monthlyWrites / 1000000 * 100).toFixed(0)}% of free tier)`)
  console.log(`  Saved writes: ${savedWrites.toLocaleString()}`)
  
  // 過去の統計からトレンドを表示
  if (allStats.length > 1) {
    console.log('\n📊 Reduction Trend (last 5 runs):')
    const recent = allStats.slice(-5)
    recent.forEach((stat, i) => {
      console.log(`  ${i + 1}. ${stat.reductionPercent}% (${new Date(stat.timestamp).toLocaleString('ja-JP')})`)
    })
    
    const avgReduction = recent.reduce((sum, s) => sum + s.reductionPercent, 0) / recent.length
    console.log(`  Average reduction: ${avgReduction.toFixed(1)}%`)
  }
}

// 実行
monitor().catch(console.error)