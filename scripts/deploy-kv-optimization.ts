#!/usr/bin/env node

/**
 * Deployment script for KV optimization rollout
 * Handles gradual migration with monitoring and rollback capabilities
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'

interface DeploymentConfig {
  stage: 'test' | 'staging' | 'production'
  enableWorkersRanking: boolean
  enableWorkersVideoStats: boolean
  fallbackToVercel: boolean
  domain: string
}

const DEPLOYMENT_CONFIGS: Record<string, DeploymentConfig> = {
  test: {
    stage: 'test',
    enableWorkersRanking: true,
    enableWorkersVideoStats: false, // Start with ranking only
    fallbackToVercel: true,
    domain: 'kv-test.nico-rank.com'
  },
  staging: {
    stage: 'staging',
    enableWorkersRanking: true,
    enableWorkersVideoStats: true,
    fallbackToVercel: true,
    domain: 'kv-staging.nico-rank.com'
  },
  production: {
    stage: 'production',
    enableWorkersRanking: true,
    enableWorkersVideoStats: true,
    fallbackToVercel: false, // No fallback in production for full optimization
    domain: 'nico-rank.com'
  }
}

function log(message: string) {
  console.log(`[KV-Deploy] ${new Date().toISOString()} - ${message}`)
}

function runCommand(command: string): string {
  log(`Executing: ${command}`)
  try {
    return execSync(command, { encoding: 'utf-8' })
  } catch (error) {
    log(`Command failed: ${error}`)
    throw error
  }
}

function createWranglerConfig(config: DeploymentConfig): string {
  const workerName = `nico-ranking-api-gateway-${config.stage}`
  
  return `name = "${workerName}"
main = "workers/hybrid-gateway.ts"
compatibility_date = "2024-06-13"

# KV namespace bindings
[[kv_namespaces]]
binding = "RANKING_DATA"
id = "80f4535c379b4e8cb89ce6dbdb7d2dc9"

# Environment variables
[vars]
NEXT_APP_URL = "https://nico-ranking-custom-yjsns-projects.vercel.app"
ENABLE_WORKERS_RANKING = "${config.enableWorkersRanking}"
ENABLE_WORKERS_VIDEO_STATS = "${config.enableWorkersVideoStats}"
FALLBACK_TO_VERCEL = "${config.fallbackToVercel}"

# Custom domain
[[routes]]
pattern = "${config.domain}/*"
zone_name = "nico-rank.com"

# TypeScript configuration
[build]
command = ""
[build.upload]
format = "modules"
main = "workers/hybrid-gateway.ts"
`
}

async function deployStage(stageName: string) {
  const config = DEPLOYMENT_CONFIGS[stageName]
  if (!config) {
    throw new Error(`Unknown stage: ${stageName}`)
  }

  log(`Starting deployment for stage: ${stageName}`)
  log(`Configuration: ${JSON.stringify(config, null, 2)}`)

  // 1. Create wrangler config for this stage
  const wranglerConfig = createWranglerConfig(config)
  const configFile = `wrangler-${stageName}.toml`
  writeFileSync(configFile, wranglerConfig)
  log(`Created ${configFile}`)

  // 2. Build and type check
  log('Running type check...')
  runCommand('npm run typecheck')

  log('Running tests...')
  runCommand('npm test -- --run')

  // 3. Deploy to Cloudflare Workers
  log(`Deploying to Cloudflare Workers (${stageName})...`)
  const deployOutput = runCommand(`wrangler deploy -c ${configFile}`)
  log('Deploy output:')
  log(deployOutput)

  // 4. Health check
  log('Performing health check...')
  await performHealthCheck(config.domain)

  // 5. Performance test
  log('Running performance test...')
  await performanceTest(config.domain)

  log(`Stage ${stageName} deployment completed successfully!`)
  
  return {
    stage: stageName,
    config,
    domain: config.domain,
    deployedAt: new Date().toISOString()
  }
}

async function performHealthCheck(domain: string) {
  const testEndpoints = [
    `https://${domain}/debug`,
    `https://${domain}/api/ranking?genre=all&period=24h`,
    `https://${domain}/api/edge/video-stats?ids=sm1,sm2,sm3`
  ]

  for (const endpoint of testEndpoints) {
    try {
      log(`Health check: ${endpoint}`)
      const response = await fetch(endpoint)
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status} ${response.statusText}`)
      }
      
      const headers = response.headers
      log(`  Status: ${response.status}`)
      log(`  X-Source: ${headers.get('X-Source') || 'unknown'}`)
      log(`  X-Cache-Status: ${headers.get('X-Cache-Status') || 'unknown'}`)
      log(`  X-API-Version: ${headers.get('X-API-Version') || 'unknown'}`)
      
    } catch (error) {
      log(`Health check failed for ${endpoint}: ${error}`)
      throw error
    }
  }
  
  log('All health checks passed!')
}

async function performanceTest(domain: string) {
  const testUrl = `https://${domain}/api/ranking?genre=all&period=24h`
  const iterations = 5
  const times: number[] = []

  log(`Performance test: ${testUrl} (${iterations} iterations)`)

  for (let i = 0; i < iterations; i++) {
    const start = Date.now()
    const response = await fetch(testUrl)
    const end = Date.now()
    
    if (!response.ok) {
      throw new Error(`Performance test failed: ${response.status}`)
    }
    
    const responseTime = end - start
    times.push(responseTime)
    
    const source = response.headers.get('X-Source') || 'unknown'
    log(`  Iteration ${i + 1}: ${responseTime}ms (source: ${source})`)
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)

  log(`Performance results:`)
  log(`  Average: ${avgTime.toFixed(2)}ms`)
  log(`  Min: ${minTime}ms`)
  log(`  Max: ${maxTime}ms`)

  // Performance thresholds
  if (avgTime > 500) {
    log(`WARNING: Average response time (${avgTime.toFixed(2)}ms) exceeds 500ms threshold`)
  }
  
  if (maxTime > 1000) {
    log(`WARNING: Max response time (${maxTime}ms) exceeds 1000ms threshold`)
  }
}

async function rollback(stageName: string) {
  log(`Rolling back stage: ${stageName}`)
  
  // Redeploy the original gateway
  const rollbackConfig = `name = "nico-ranking-api-gateway-${stageName}"
main = "workers/api-gateway-simple.ts"
compatibility_date = "2024-06-13"

[[kv_namespaces]]
binding = "RANKING_DATA"
id = "80f4535c379b4e8cb89ce6dbdb7d2dc9"

[vars]
NEXT_APP_URL = "https://nico-ranking-custom-yjsns-projects.vercel.app"

[[routes]]
pattern = "${DEPLOYMENT_CONFIGS[stageName]?.domain || 'nico-rank.com'}/*"
zone_name = "nico-rank.com"

[build]
command = ""
[build.upload]
format = "modules"
main = "workers/api-gateway-simple.ts"
`
  
  const rollbackFile = `wrangler-rollback-${stageName}.toml`
  writeFileSync(rollbackFile, rollbackConfig)
  
  runCommand(`wrangler deploy -c ${rollbackFile}`)
  log(`Rollback completed for stage: ${stageName}`)
}

async function monitorDeployment(domain: string, durationMinutes: number = 10) {
  log(`Monitoring deployment for ${durationMinutes} minutes...`)
  
  const endTime = Date.now() + (durationMinutes * 60 * 1000)
  let errorCount = 0
  let totalRequests = 0
  
  while (Date.now() < endTime) {
    try {
      const response = await fetch(`https://${domain}/api/ranking?genre=all&period=24h`)
      totalRequests++
      
      if (!response.ok) {
        errorCount++
        log(`ERROR: Request failed with status ${response.status}`)
      }
      
      const source = response.headers.get('X-Source') || 'unknown'
      if (totalRequests % 10 === 0) {
        log(`Monitoring: ${totalRequests} requests, ${errorCount} errors, source: ${source}`)
      }
      
    } catch (error) {
      errorCount++
      log(`ERROR: Request failed with exception: ${error}`)
    }
    
    // Wait 30 seconds between requests
    await new Promise(resolve => setTimeout(resolve, 30000))
  }
  
  const errorRate = (errorCount / totalRequests) * 100
  log(`Monitoring completed:`)
  log(`  Total requests: ${totalRequests}`)
  log(`  Errors: ${errorCount}`)
  log(`  Error rate: ${errorRate.toFixed(2)}%`)
  
  if (errorRate > 5) {
    throw new Error(`High error rate detected: ${errorRate.toFixed(2)}%`)
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]
  const stage = args[1]

  try {
    switch (command) {
      case 'deploy':
        if (!stage || !DEPLOYMENT_CONFIGS[stage]) {
          throw new Error('Usage: npm run deploy:kv-optimization deploy <test|staging|production>')
        }
        await deployStage(stage)
        break

      case 'rollback':
        if (!stage || !DEPLOYMENT_CONFIGS[stage]) {
          throw new Error('Usage: npm run deploy:kv-optimization rollback <test|staging|production>')
        }
        await rollback(stage)
        break

      case 'monitor':
        if (!stage || !DEPLOYMENT_CONFIGS[stage]) {
          throw new Error('Usage: npm run deploy:kv-optimization monitor <test|staging|production> [minutes]')
        }
        const minutes = parseInt(args[2]) || 10
        await monitorDeployment(DEPLOYMENT_CONFIGS[stage].domain, minutes)
        break

      case 'test-all':
        log('Deploying and testing all stages...')
        for (const stageName of ['test', 'staging']) {
          await deployStage(stageName)
          await monitorDeployment(DEPLOYMENT_CONFIGS[stageName].domain, 5)
        }
        log('All stages tested successfully!')
        break

      default:
        console.log('Usage:')
        console.log('  npm run deploy:kv-optimization deploy <test|staging|production>')
        console.log('  npm run deploy:kv-optimization rollback <test|staging|production>')
        console.log('  npm run deploy:kv-optimization monitor <test|staging|production> [minutes]')
        console.log('  npm run deploy:kv-optimization test-all')
        process.exit(1)
    }
  } catch (error) {
    log(`Deployment failed: ${error}`)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}