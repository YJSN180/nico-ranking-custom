#!/usr/bin/env npx tsx

import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const VERCEL_URL = process.env.VERCEL_URL || 'https://nico-rank.com'
const CRON_SECRET = process.env.CRON_SECRET

if (!CRON_SECRET) {
  console.error('❌ CRON_SECRET is not set in .env.local')
  process.exit(1)
}

async function checkStatus() {
  try {
    const response = await fetch(`${VERCEL_URL}/api/monitor/kv-kill-switch`)
    const data = await response.json()
    
    console.log('\n📊 Kill Switch Status:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Status: ${data.active ? '🔴 ACTIVE (Writes Suspended)' : '🟢 INACTIVE (Writes Enabled)'}`)
    if (data.active) {
      console.log(`Reason: ${data.reason}`)
      console.log(`Activated At: ${data.activatedAt}`)
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    return data
  } catch (error) {
    console.error('❌ Failed to check kill switch status:', error)
    process.exit(1)
  }
}

async function activate(reason: string) {
  try {
    const response = await fetch(`${VERCEL_URL}/api/monitor/kv-kill-switch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }
    
    const data = await response.json()
    console.log('\n✅ Kill Switch Activated!')
    console.log(`Reason: ${data.reason}`)
    console.log(`Activated At: ${data.activatedAt}`)
    console.log('\n⚠️  All KV writes are now suspended!\n')
  } catch (error) {
    console.error('❌ Failed to activate kill switch:', error)
    process.exit(1)
  }
}

async function deactivate() {
  try {
    const response = await fetch(`${VERCEL_URL}/api/monitor/kv-kill-switch`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }
    
    console.log('\n✅ Kill Switch Deactivated!')
    console.log('KV writes are now enabled.\n')
  } catch (error) {
    console.error('❌ Failed to deactivate kill switch:', error)
    process.exit(1)
  }
}

async function checkWriteCount() {
  try {
    const response = await fetch(`${VERCEL_URL}/api/monitor/kv-writes`, {
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`
      }
    })
    
    const data = await response.json()
    console.log('\n📊 KV Write Count:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Date: ${data.date}`)
    console.log(`Write Count: ${data.manualCount || 0}`)
    console.log(`Remaining: ${1000 - (data.manualCount || 0)}`)
    if (data.warning) {
      console.log(`⚠️  Warning: ${data.warning}`)
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  } catch (error) {
    console.error('❌ Failed to check write count:', error)
  }
}

async function main() {
  const command = process.argv[2]
  const reason = process.argv.slice(3).join(' ')
  
  console.log('\n🔧 KV Kill Switch Manager')
  console.log('========================\n')
  
  switch (command) {
    case 'status':
      await checkStatus()
      await checkWriteCount()
      break
      
    case 'activate':
    case 'on':
      if (!reason) {
        console.error('❌ Please provide a reason: npm run kv:kill-switch activate "Reason for suspension"')
        process.exit(1)
      }
      await activate(reason)
      break
      
    case 'deactivate':
    case 'off':
      await deactivate()
      break
      
    case 'check':
      await checkWriteCount()
      break
      
    default:
      console.log('Usage:')
      console.log('  npm run kv:kill-switch status              - Check current status')
      console.log('  npm run kv:kill-switch activate "reason"   - Activate kill switch')
      console.log('  npm run kv:kill-switch deactivate          - Deactivate kill switch')
      console.log('  npm run kv:kill-switch check               - Check write count only')
      console.log('\nAliases:')
      console.log('  on  = activate')
      console.log('  off = deactivate')
      process.exit(1)
  }
}

main().catch(console.error)