import { config } from 'dotenv'

// Load environment variables
config()

async function triggerCron() {
  const cronSecret = process.env.CRON_SECRET
  const baseUrl = process.env.VERCEL_URL || 'http://localhost:3000'
  
  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not set')
    process.exit(1)
  }
  
  console.log('Triggering cron job...')
  console.log(`URL: ${baseUrl}/api/cron/fetch`)
  
  try {
    const response = await fetch(`${baseUrl}/api/cron/fetch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json'
      }
    })
    
    const data = await response.json()
    
    if (response.ok) {
      console.log('Success:', data)
    } else {
      console.error('Error:', response.status, data)
    }
  } catch (error) {
    console.error('Failed to trigger cron:', error)
  }
}

triggerCron()