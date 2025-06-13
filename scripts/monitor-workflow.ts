#!/usr/bin/env npx tsx
import { execSync } from 'child_process'

async function checkWorkflowStatus() {
  const runId = process.argv[2]
  
  if (!runId) {
    console.error('Usage: npx tsx scripts/monitor-workflow.ts <run-id>')
    process.exit(1)
  }
  
  console.log(`Monitoring workflow run: ${runId}`)
  console.log('=' .repeat(50))
  
  let isCompleted = false
  let checkCount = 0
  const maxChecks = 30 // Max 15 minutes (30 * 30s)
  
  while (!isCompleted && checkCount < maxChecks) {
    try {
      // Get workflow status
      const statusCmd = `gh run view ${runId} --json status,conclusion`
      const statusResult = execSync(statusCmd, { encoding: 'utf-8' })
      const status = JSON.parse(statusResult)
      
      console.log(`\n[${new Date().toISOString()}] Status: ${status.status}`)
      
      if (status.status === 'completed') {
        isCompleted = true
        console.log(`Conclusion: ${status.conclusion}`)
        
        // Get detailed logs
        try {
          const logsCmd = `gh run view ${runId} --log | grep -E "(Aggregated|Successfully aggregated|Failed genres|Successful genres|genres collected|Total items)" | tail -20`
          const logs = execSync(logsCmd, { encoding: 'utf-8' })
          console.log('\nAggregation Results:')
          console.log(logs)
        } catch (e) {
          console.log('Could not retrieve aggregation logs')
        }
        
        break
      }
      
      // Check job statuses
      const jobsCmd = `gh run view ${runId} --json jobs`
      const jobsResult = execSync(jobsCmd, { encoding: 'utf-8' })
      const { jobs } = JSON.parse(jobsResult)
      
      const jobSummary = jobs.reduce((acc: any, job: any) => {
        acc[job.status] = (acc[job.status] || 0) + 1
        return acc
      }, {})
      
      console.log('Job statuses:', jobSummary)
      
      // If still in progress, wait 30 seconds
      if (!isCompleted) {
        console.log('Waiting 30 seconds before next check...')
        await new Promise(resolve => setTimeout(resolve, 30000))
      }
      
    } catch (error) {
      console.error('Error checking workflow:', error)
    }
    
    checkCount++
  }
  
  if (!isCompleted) {
    console.log('\nWorkflow did not complete within monitoring period')
  }
}

checkWorkflowStatus().catch(console.error)