#!/usr/bin/env node

/**
 * DNS設定確認スクリプト
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function checkDNS(domain: string) {
  console.log(`\n🔍 Checking DNS for ${domain}...`)
  
  try {
    // nslookupコマンドでDNS解決を確認
    const { stdout } = await execAsync(`nslookup ${domain}`)
    console.log('✅ DNS解決成功:')
    console.log(stdout)
    
    // digコマンドでCNAMEレコードを確認（利用可能な場合）
    try {
      const { stdout: digOutput } = await execAsync(`dig ${domain} CNAME +short`)
      if (digOutput.trim()) {
        console.log(`CNAME: ${digOutput.trim()}`)
      }
    } catch {
      // digが利用できない場合は無視
    }
    
    return true
  } catch (error) {
    console.log('❌ DNS解決失敗')
    console.log('DNSがまだ伝播していない可能性があります（最大48時間かかる場合があります）')
    return false
  }
}

async function checkHTTP(url: string) {
  console.log(`\n🌐 Checking HTTP access for ${url}...`)
  
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000)
    })
    
    console.log(`✅ HTTPステータス: ${response.status}`)
    console.log('ヘッダー:')
    console.log(`  Server: ${response.headers.get('server')}`)
    console.log(`  CF-Ray: ${response.headers.get('cf-ray')}`)
    
    return true
  } catch (error: any) {
    console.log(`❌ HTTPアクセス失敗: ${error.message}`)
    return false
  }
}

async function verifySetup() {
  console.log('🚀 DNS設定確認を開始します...\n')
  
  const domains = [
    'nico-rank.com',
    'www.nico-rank.com'
  ]
  
  let allSuccess = true
  
  // DNS確認
  for (const domain of domains) {
    const dnsOk = await checkDNS(domain)
    if (!dnsOk) allSuccess = false
  }
  
  // HTTP確認
  for (const domain of domains) {
    const httpOk = await checkHTTP(`https://${domain}`)
    if (!httpOk) allSuccess = false
  }
  
  // Workers URLの確認（比較用）
  console.log('\n📊 Workers URL（比較用）:')
  await checkHTTP('https://nico-ranking-api-gateway.yjsn180180.workers.dev')
  
  // Vercel直接URLのアクセス制限確認
  console.log('\n🔒 Vercel直接URLのアクセス制限確認:')
  try {
    const response = await fetch('https://nico-ranking-custom-yjsns-projects.vercel.app', {
      redirect: 'manual',
      signal: AbortSignal.timeout(10000)
    })
    
    if (response.status === 302 || response.status === 301) {
      console.log('✅ リダイレクトが設定されています')
      console.log(`  Location: ${response.headers.get('location')}`)
    } else {
      console.log('⚠️  直接アクセスが可能です（制限が機能していない可能性）')
    }
  } catch (error) {
    console.log('エラー:', error)
  }
  
  console.log('\n================')
  if (allSuccess) {
    console.log('✅ すべての設定が完了しています！')
  } else {
    console.log('⚠️  一部の設定がまだ完了していません')
    console.log('DNS伝播には最大48時間かかる場合があります')
  }
}

// 実行
verifySetup().catch(console.error)