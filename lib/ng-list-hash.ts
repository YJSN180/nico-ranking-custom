/**
 * NGリスト用の軽量ハッシュ関数
 * JSON.stringifyよりも高速で、NGリストの変更を検出できる
 */

import type { NGList } from '@/types/ng-list'

/**
 * NGリストから変更検出用のハッシュ値を生成
 * @param ngList NGリスト
 * @returns ハッシュ値（数値）
 */
export function generateNGListHash(ngList: NGList): number {
  let hash = 0
  
  // 各配列のアイテム数をハッシュに含める
  hash = hash * 31 + (ngList.videoIds?.length || 0)
  hash = hash * 31 + (ngList.videoTitles?.exact?.length || 0)
  hash = hash * 31 + (ngList.videoTitles?.partial?.length || 0)
  hash = hash * 31 + (ngList.authorIds?.length || 0)
  hash = hash * 31 + (ngList.authorNames?.exact?.length || 0)
  hash = hash * 31 + (ngList.authorNames?.partial?.length || 0)
  hash = hash * 31 + (ngList.derivedVideoIds?.length || 0)
  
  // 各配列の最初と最後の要素をハッシュに含める（高速化のため全要素は見ない）
  const arrays = [
    ngList.videoIds,
    ngList.videoTitles?.exact,
    ngList.videoTitles?.partial,
    ngList.authorIds,
    ngList.authorNames?.exact,
    ngList.authorNames?.partial,
    ngList.derivedVideoIds
  ]
  
  arrays.forEach((arr) => {
    if (arr && arr.length > 0) {
      // 最初の要素
      hash = hash * 31 + simpleStringHash(arr[0])
      // 最後の要素（異なる場合のみ）
      if (arr.length > 1) {
        hash = hash * 31 + simpleStringHash(arr[arr.length - 1])
      }
    }
  })
  
  // 32ビット整数に収める
  return hash >>> 0
}

/**
 * 文字列の簡易ハッシュ関数
 * @param str 文字列
 * @returns ハッシュ値
 */
function simpleStringHash(str: string): number {
  let hash = 0
  // 文字列が長い場合は最初の10文字と最後の10文字のみを使用（高速化）
  const len = str.length
  const sampleSize = Math.min(10, len)
  
  // 最初の部分
  for (let i = 0; i < sampleSize; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }
  
  // 最後の部分（文字列が十分長い場合）
  if (len > sampleSize * 2) {
    for (let i = len - sampleSize; i < len; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i)
      hash = hash & hash
    }
  }
  
  return hash >>> 0
}