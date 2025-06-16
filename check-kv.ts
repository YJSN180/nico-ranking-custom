import 'dotenv/config'

async function checkKV() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  console.log('環境変数の確認:')
  console.log('CF_ACCOUNT_ID:', CF_ACCOUNT_ID ? '設定済み' : '未設定')
  console.log('CF_NAMESPACE_ID:', CF_NAMESPACE_ID ? '設定済み' : '未設定')
  console.log('CF_API_TOKEN:', CF_API_TOKEN ? '設定済み' : '未設定')
  
  if (\!CF_ACCOUNT_ID || \!CF_NAMESPACE_ID || \!CF_API_TOKEN) {
    console.error('Cloudflare KV credentials not configured')
    return
  }
  
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/RANKING_LATEST`
  
  console.log('\nKVからデータを取得中...')
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
    },
  })
  
  console.log('ステータス:', response.status)
  
  if (response.status === 404) {
    console.log('データが見つかりません (404)')
    return
  }
  
  if (\!response.ok) {
    console.error('エラー:', await response.text())
    return
  }
  
  const data = await response.arrayBuffer()
  console.log('データサイズ:', data.byteLength, 'bytes')
  
  const uint8Array = new Uint8Array(data)
  if (uint8Array[0] === 0x1f && uint8Array[1] === 0x8b) {
    console.log('データは圧縮されています (gzip)')
    
    const pako = await import('pako')
    const decompressed = pako.ungzip(uint8Array, { to: 'string' })
    const parsed = JSON.parse(decompressed)
    
    console.log('\nデータ構造:')
    console.log('- genres:', Object.keys(parsed.genres || {}).join(', '))
    console.log('- metadata:', parsed.metadata)
    
    if (parsed.genres?.all) {
      console.log('\n"all"ジャンルの24時間ランキング:')
      console.log('- アイテム数:', parsed.genres.all['24h']?.items?.length || 0)
      console.log('- 人気タグ数:', parsed.genres.all['24h']?.popularTags?.length || 0)
    }
  }
}

checkKV().catch(console.error)
