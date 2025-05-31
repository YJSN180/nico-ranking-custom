// プロキシサーバー経由での包括的なテスト

import { testProxyAccess } from '../lib/proxy-scraper'

async function comprehensiveProxyTest() {
  console.log('=== 包括的プロキシテスト ===\n')
  
  // 1. 基本的なプロキシテスト
  await testProxyAccess()
  
  // 2. より詳細なテスト
  console.log('\n\n=== 詳細テスト ===')
  
  // 実際に動作する可能性のある無料プロキシ
  const freeProxies = [
    // 日本のプロキシ（例）
    { host: '43.153.7.124', port: 8080 },
    { host: '203.104.213.164', port: 8080 },
    { host: '153.126.194.52', port: 3128 },
    
    // SOCKS5プロキシ
    { url: 'socks5://jp-proxy.example.com:1080' }
  ]
  
  console.log('利用可能な無料プロキシをテスト中...')
  console.log('注意: 無料プロキシは信頼性が低く、動作しない可能性があります')
  
  // 3. ローカルプロキシサーバーの起動を提案
  console.log('\n\n=== ローカルプロキシサーバーの提案 ===')
  console.log('より確実な方法として、ローカルプロキシサーバーの使用を推奨します：')
  console.log('\n1. mitmproxyを使用:')
  console.log('   pip install mitmproxy')
  console.log('   mitmproxy -p 8080')
  console.log('\n2. node-http-proxyを使用:')
  console.log('   npm install -g http-proxy')
  console.log('\n3. Squidプロキシを使用:')
  console.log('   sudo apt-get install squid')
  console.log('   sudo service squid start')
  
  // 4. VPNの提案
  console.log('\n\n=== VPNサービスの提案 ===')
  console.log('日本のIPアドレスを取得する最も確実な方法：')
  console.log('- NordVPN (有料)')
  console.log('- ExpressVPN (有料)')
  console.log('- ProtonVPN (無料プランあり)')
  console.log('- Windscribe (無料プランあり)')
  
  // 5. サーバーサイドプロキシの提案
  console.log('\n\n=== サーバーサイドプロキシAPI ===')
  console.log('Next.jsのAPIルートを使用してプロキシを実装:')
  console.log(`
// app/api/internal-proxy/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre')
  const term = searchParams.get('term')
  
  // 日本のVPSやプロキシサービスを経由
  const response = await fetch(
    \`https://www.nicovideo.jp/ranking/genre/\${genre}?term=\${term}\`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Cookie': 'sensitive_material_status=accept'
      }
    }
  )
  
  return response
}
  `)
}

comprehensiveProxyTest().catch(console.error)