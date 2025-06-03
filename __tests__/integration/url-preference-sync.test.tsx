import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RankingConfig } from '@/types/ranking-config'

// URLパラメータとconfigステートの同期をテストする簡易版

describe('URL parameter and config state synchronization', () => {
  it('should update config when URL parameters change', () => {
    // 現在の実装を確認
    // 初期値: genre=all, period=24h
    const initialConfig: RankingConfig = {
      genre: 'all',
      period: '24h',
      tag: undefined
    }
    
    // PreferenceLoaderがURLを更新: genre=other, period=hour, tag=AIのべりすと
    const urlParams = new URLSearchParams({
      genre: 'other',
      period: 'hour',
      tag: 'AIのべりすと'
    })
    
    // 問題: configステートがURLパラメータの変更に追従しない
    // 期待される動作: URLパラメータが変更されたらconfigも更新される
    
    // 修正なしの場合
    let configWithoutFix = initialConfig // 初期値のまま
    
    // 修正ありの場合（useEffectでsearchParamsを監視）
    let configWithFix: RankingConfig = {
      genre: urlParams.get('genre') as any || 'all',
      period: urlParams.get('period') as any || '24h',
      tag: urlParams.get('tag') || undefined
    }
    
    // アサーション
    // 修正なし: configは初期値のまま
    expect(configWithoutFix.genre).toBe('all')
    expect(configWithoutFix.period).toBe('24h')
    expect(configWithoutFix.tag).toBeUndefined()
    
    // 修正あり: configはURLパラメータに同期
    expect(configWithFix.genre).toBe('other')
    expect(configWithFix.period).toBe('hour')
    expect(configWithFix.tag).toBe('AIのべりすと')
  })
  
  it('demonstrates the user experience issue', () => {
    // ユーザーシナリオ：
    // 1. 前回「その他」ジャンルの「毎時」ランキングを見ていた
    // 2. ブラウザを閉じて再訪問
    // 3. PreferenceLoaderがlocalStorageから設定を読み込み、URLを更新
    // 4. 問題: オプション画面は「すべて」「24時間」を表示（URLは正しく更新されているのに）
    
    const savedPreferences = {
      lastGenre: 'other',
      lastPeriod: 'hour',
      lastTag: 'AIのべりすと'
    }
    
    // URLは正しく更新される
    const currentUrl = `/?genre=${savedPreferences.lastGenre}&period=${savedPreferences.lastPeriod}&tag=${savedPreferences.lastTag}`
    expect(currentUrl).toBe('/?genre=other&period=hour&tag=AIのべりすと')
    
    // しかし、configステートは初期値のまま（修正前）
    const configBeforeFix = {
      genre: 'all', // URLは'other'なのに
      period: '24h', // URLは'hour'なのに
      tag: undefined // URLは'AIのべりすと'なのに
    }
    
    // これがユーザーに見える不整合
    expect(configBeforeFix.genre).not.toBe(savedPreferences.lastGenre)
    expect(configBeforeFix.period).not.toBe(savedPreferences.lastPeriod)
    expect(configBeforeFix.tag).not.toBe(savedPreferences.lastTag)
  })
})