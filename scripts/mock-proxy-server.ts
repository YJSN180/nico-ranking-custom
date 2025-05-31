#!/usr/bin/env tsx

import { createServer } from 'http'
import { parse } from 'url'

// モックプロキシサーバー
// 実際にニコニコ動画から完全なHTMLを取得するシミュレーション

const PORT = 8888

const server = createServer(async (req, res) => {
  console.log(`[Proxy] Request received: ${req.method} ${req.url}`)
  
  if (req.method !== 'POST' || req.url !== '/') {
    res.writeHead(404)
    res.end('Not Found')
    return
  }
  
  // APIキーチェック
  const apiKey = req.headers['x-api-key']
  if (apiKey !== 'test-key') {
    res.writeHead(401)
    res.end('Unauthorized')
    return
  }
  
  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', async () => {
    try {
      const request = JSON.parse(body)
      const targetUrl = request.url
      const targetHeaders = request.headers || {}
      
      console.log(`[Proxy] Fetching: ${targetUrl}`)
      
      // 実際にニコニコ動画にアクセス
      const response = await fetch(targetUrl, {
        headers: {
          ...targetHeaders,
          // プロキシサーバーは日本のIPを持っていると仮定
          'X-Forwarded-For': '203.0.113.1', // 日本のIPアドレス例
        }
      })
      
      const html = await response.text()
      console.log(`[Proxy] Response received: ${response.status}, HTML length: ${html.length}`)
      
      // data-video-idの数を確認
      const videoIds = (html.match(/data-video-id="((?:sm|nm|so)\d+)"/g) || [])
      console.log(`[Proxy] Found ${videoIds.length} video IDs`)
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: response.status,
        body: html,
        headers: Object.fromEntries(response.headers.entries())
      }))
    } catch (error) {
      console.error('[Proxy] Error:', error)
      res.writeHead(500)
      res.end(JSON.stringify({ error: String(error) }))
    }
  })
})

server.listen(PORT, () => {
  console.log(`[Proxy] Mock proxy server running on http://localhost:${PORT}`)
  console.log('[Proxy] Press Ctrl+C to stop')
})