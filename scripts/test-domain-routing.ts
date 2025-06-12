#!/usr/bin/env node

/**
 * ドメインルーティングのテストスクリプト
 * TDD原則に基づいた段階的な検証
 */

interface TestResult {
  test: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  message?: string
}

const results: TestResult[] = []

async function testDNSResolution(domain: string): Promise<TestResult> {
  console.log(`\n🔍 Testing DNS resolution for ${domain}...`)
  
  try {
    const response = await fetch(`${domain}/api/status`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    })
    
    return {
      test: `DNS Resolution: ${domain}`,
      status: 'PASS',
      message: `Status: ${response.status}`
    }
  } catch (error: any) {
    if (error.cause?.code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
      return {
        test: `DNS Resolution: ${domain}`,
        status: 'SKIP',
        message: 'DNS not propagated yet'
      }
    }
    return {
      test: `DNS Resolution: ${domain}`,
      status: 'FAIL',
      message: error.message
    }
  }
}

async function testSecurityHeaders(url: string): Promise<TestResult> {
  console.log(`\n🔒 Testing security headers for ${url}...`)
  
  try {
    const response = await fetch(url)
    
    const requiredHeaders = {
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'x-xss-protection': '1; mode=block',
      'referrer-policy': 'strict-origin-when-cross-origin'
    }
    
    const missingHeaders = []
    for (const [header, expectedValue] of Object.entries(requiredHeaders)) {
      const actualValue = response.headers.get(header)
      if (actualValue !== expectedValue) {
        missingHeaders.push(`${header}: expected "${expectedValue}", got "${actualValue}"`)
      }
    }
    
    if (missingHeaders.length > 0) {
      return {
        test: 'Security Headers',
        status: 'FAIL',
        message: `Missing/incorrect headers: ${missingHeaders.join(', ')}`
      }
    }
    
    return {
      test: 'Security Headers',
      status: 'PASS',
      message: 'All security headers present'
    }
  } catch (error: any) {
    return {
      test: 'Security Headers',
      status: 'FAIL',
      message: error.message
    }
  }
}

async function testRateLimiting(url: string): Promise<TestResult> {
  console.log(`\n⏱️  Testing rate limiting...`)
  
  try {
    const requests = []
    for (let i = 0; i < 15; i++) {
      requests.push(fetch(`${url}/api/ranking?genre=all&period=24h`))
    }
    
    const responses = await Promise.all(requests)
    const statusCodes = responses.map(r => r.status)
    const rateLimited = statusCodes.filter(status => status === 429)
    
    if (rateLimited.length > 0) {
      return {
        test: 'Rate Limiting',
        status: 'PASS',
        message: `${rateLimited.length}/15 requests were rate limited`
      }
    }
    
    return {
      test: 'Rate Limiting',
      status: 'FAIL',
      message: 'No requests were rate limited'
    }
  } catch (error: any) {
    return {
      test: 'Rate Limiting',
      status: 'FAIL',
      message: error.message
    }
  }
}

async function testProxyFunctionality(url: string): Promise<TestResult> {
  console.log(`\n🔄 Testing proxy functionality...`)
  
  try {
    const response = await fetch(url)
    
    if (response.status !== 200) {
      return {
        test: 'Proxy Functionality',
        status: 'FAIL',
        message: `Status ${response.status}`
      }
    }
    
    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('text/html')) {
      return {
        test: 'Proxy Functionality',
        status: 'FAIL',
        message: `Wrong content-type: ${contentType}`
      }
    }
    
    const html = await response.text()
    if (!html.includes('ニコニコランキング')) {
      return {
        test: 'Proxy Functionality',
        status: 'FAIL',
        message: 'Expected content not found'
      }
    }
    
    return {
      test: 'Proxy Functionality',
      status: 'PASS',
      message: 'Successfully proxied to Vercel app'
    }
  } catch (error: any) {
    return {
      test: 'Proxy Functionality',
      status: 'FAIL',
      message: error.message
    }
  }
}

async function runTests() {
  console.log('🧪 Running Domain Routing Tests...\n')
  
  const domains = [
    'https://nico-rank.com',
    'https://www.nico-rank.com',
    'https://nico-ranking-api-gateway.yjsn180180.workers.dev'
  ]
  
  // 1. DNS解決テスト
  for (const domain of domains) {
    results.push(await testDNSResolution(domain))
  }
  
  // Workers URLでのみ実行するテスト
  const workersUrl = 'https://nico-ranking-api-gateway.yjsn180180.workers.dev'
  
  // 2. セキュリティヘッダーテスト
  results.push(await testSecurityHeaders(workersUrl))
  
  // 3. レート制限テスト
  results.push(await testRateLimiting(workersUrl))
  
  // 4. プロキシ機能テスト
  results.push(await testProxyFunctionality(workersUrl))
  
  // 結果の表示
  console.log('\n\n📊 Test Results:')
  console.log('================\n')
  
  let passed = 0
  let failed = 0
  let skipped = 0
  
  results.forEach(result => {
    const icon = result.status === 'PASS' ? '✅' : 
                 result.status === 'FAIL' ? '❌' : '⏭️'
    console.log(`${icon} ${result.test}`)
    if (result.message) {
      console.log(`   ${result.message}`)
    }
    
    if (result.status === 'PASS') passed++
    else if (result.status === 'FAIL') failed++
    else skipped++
  })
  
  console.log('\n================')
  console.log(`Total: ${results.length} tests`)
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`⏭️  Skipped: ${skipped}`)
  
  if (failed > 0) {
    process.exit(1)
  }
}

// 実行
runTests().catch(console.error)