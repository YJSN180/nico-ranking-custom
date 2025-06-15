#!/usr/bin/env node

/**
 * Vercelプレビューデプロイメント用のローカルプロキシ
 * 使い方: node preview-proxy.js
 * ブラウザで http://localhost:3001 にアクセス
 */

const http = require('http');
const https = require('https');

const PREVIEW_URL = 'https://nico-ranking-custom-8ppsu76yu-yjsns-projects.vercel.app';
// const PROTECTION_KEY = 'a0924bd205fe93fe4bbaa7a899fbb52beae77b25a4464f881a4c120f26e1a139';  // 無効化
const LOCAL_PORT = 3001;

const server = http.createServer((req, res) => {
  const url = new URL(PREVIEW_URL + req.url);
  
  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      ...req.headers,
      // 'X-Preview-Protection': PROTECTION_KEY,  // 無効化
      host: url.hostname
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    console.error('Proxy error:', error);
    res.writeHead(500);
    res.end('Proxy error');
  });

  req.pipe(proxyReq);
});

server.listen(LOCAL_PORT, () => {
  console.log(`プレビュープロキシが起動しました: http://localhost:${LOCAL_PORT}`);
  console.log(`プレビューURL: ${PREVIEW_URL}`);
  console.log('Ctrl+C で終了');
});