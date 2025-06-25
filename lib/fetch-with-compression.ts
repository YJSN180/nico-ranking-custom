/**
 * 圧縮対応のfetch（簡略版）
 * 
 * ブラウザではContent-Encoding: gzipが自動的に処理される
 * SSRでは手動解凍が必要な場合がある
 */

export async function fetchWithCompression(url: string, options?: RequestInit): Promise<Response> {
  // 通常のfetchをそのまま使用
  // ブラウザが自動的にContent-Encodingを処理する
  return fetch(url, options)
}