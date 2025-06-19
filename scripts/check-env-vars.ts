#!/usr/bin/env npx tsx

// 環境変数の存在確認（値は表示しない）
const requiredVars = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_KV_NAMESPACE_ID', 
  'CLOUDFLARE_KV_API_TOKEN'
]

console.log('=== Environment Variables Check ===\n')

requiredVars.forEach(varName => {
  const exists = !!process.env[varName]
  const maskedValue = exists ? `${process.env[varName]?.substring(0, 4)}...` : 'NOT SET'
  console.log(`${varName}: ${exists ? '✓ SET' : '✗ NOT SET'} (${maskedValue})`)
})

console.log('\n=== Vercel Environment ===')
console.log(`VERCEL: ${process.env.VERCEL ? 'YES' : 'NO'}`)
console.log(`VERCEL_ENV: ${process.env.VERCEL_ENV || 'NOT SET'}`)
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`)