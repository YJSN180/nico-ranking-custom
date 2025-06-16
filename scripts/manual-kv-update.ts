#!/usr/bin/env npx tsx
/**
 * Manual script to trigger KV update
 * This can be used to test the KV write functionality
 */

import 'dotenv/config'

async function triggerWorkflow() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  
  if (!token) {
    console.error('Error: GITHUB_TOKEN or GH_TOKEN not found in environment')
    console.error('Please set one of these environment variables with a GitHub personal access token')
    process.exit(1)
  }

  console.log('Triggering Update Nico Ranking Data (Parallel) workflow...')
  
  const response = await fetch(
    'https://api.github.com/repos/YJSN180/nico-ranking-custom/actions/workflows/update-ranking-parallel.yml/dispatches',
    {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main'
      })
    }
  )

  if (response.status === 204) {
    console.log('✅ Workflow triggered successfully!')
    console.log('Check the Actions tab on GitHub to monitor progress')
    console.log('https://github.com/YJSN180/nico-ranking-custom/actions')
  } else {
    console.error(`❌ Failed to trigger workflow: ${response.status}`)
    const text = await response.text()
    console.error(text)
  }
}

// Run if called directly
if (require.main === module) {
  triggerWorkflow().catch(console.error)
}