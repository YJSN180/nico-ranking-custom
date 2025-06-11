#!/usr/bin/env node

/**
 * Cloudflare Workers環境切り替えスクリプト
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import readline from 'readline'

const execAsync = promisify(exec)
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve)
  })
}

async function getLatestPreviewUrl(): Promise<string | null> {
  try {
    // Vercelの最新プレビューデプロイメントを取得
    console.log('🔍 最新のプレビューURLを取得中...')
    
    // 実際にはVercel APIを使用するか、手動で入力
    const manualUrl = await question('プレビューURLを入力してください (空白で本番環境): ')
    return manualUrl.trim() || null
  } catch (error) {
    console.error('Error:', error)
    return null
  }
}

async function switchEnvironment() {
  console.log('🔄 Cloudflare Workers環境切り替えツール\n')
  
  const choice = await question(`
どちらの環境を使用しますか？
1) 本番環境 (main branch)
2) プレビュー環境 (feature branch)
3) デバッグ情報を表示

選択 (1-3): `)

  switch (choice.trim()) {
    case '1':
      console.log('\n✅ 本番環境に切り替えます...')
      await deployProduction()
      break
      
    case '2':
      console.log('\n🔧 プレビュー環境に切り替えます...')
      await deployPreview()
      break
      
    case '3':
      console.log('\n📊 現在の設定を確認します...')
      await showDebugInfo()
      break
      
    default:
      console.log('無効な選択です')
  }
  
  rl.close()
}

async function deployProduction() {
  try {
    console.log('デプロイ中...')
    const { stdout } = await execAsync(
      'export CLOUDFLARE_API_TOKEN=MveiaVjt0FKnbbKpKUB4uWPRCCsTb37gyby7nlrl && ' +
      'npx wrangler deploy --var USE_PREVIEW:false'
    )
    console.log('✅ 本番環境にデプロイしました！')
    console.log('URL: https://www.nico-rank.com')
  } catch (error) {
    console.error('デプロイエラー:', error)
  }
}

async function deployPreview() {
  try {
    const previewUrl = await getLatestPreviewUrl()
    
    if (!previewUrl) {
      console.log('プレビューURLが指定されていません')
      return
    }
    
    console.log(`プレビューURL: ${previewUrl}`)
    console.log('デプロイ中...')
    
    // まずシークレットを設定
    await execAsync(
      `export CLOUDFLARE_API_TOKEN=MveiaVjt0FKnbbKpKUB4uWPRCCsTb37gyby7nlrl && ` +
      `echo "${previewUrl}" | npx wrangler secret put PREVIEW_URL`
    )
    
    // その後デプロイ
    const { stdout } = await execAsync(
      'export CLOUDFLARE_API_TOKEN=MveiaVjt0FKnbbKpKUB4uWPRCCsTb37gyby7nlrl && ' +
      'npx wrangler deploy --var USE_PREVIEW:true'
    )
    
    console.log('✅ プレビュー環境にデプロイしました！')
    console.log('URL: https://www.nico-rank.com (プレビュー環境を表示)')
  } catch (error) {
    console.error('デプロイエラー:', error)
  }
}

async function showDebugInfo() {
  try {
    const response = await fetch('https://nico-ranking-api-gateway.yjsn180180.workers.dev/debug')
    const data = await response.json()
    
    console.log('\n現在の設定:')
    console.log('================')
    console.log(`USE_PREVIEW: ${data.env.USE_PREVIEW}`)
    console.log(`ACTIVE_URL: ${data.env.ACTIVE_URL}`)
    console.log('================\n')
    
    if (data.env.USE_PREVIEW === 'true') {
      console.log('🔧 現在プレビュー環境を使用中')
    } else {
      console.log('✅ 現在本番環境を使用中')
    }
  } catch (error) {
    console.error('デバッグ情報の取得に失敗:', error)
  }
}

// 実行
switchEnvironment().catch(console.error)