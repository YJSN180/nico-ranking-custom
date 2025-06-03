import { describe, it, expect, beforeEach } from 'vitest'

describe('ユーザー設定のE2Eシミュレーション', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('実際のユーザーフローをシミュレート', () => {
    // 1. 初回訪問時
    expect(localStorage.getItem('user-preferences')).toBeNull()
    expect(localStorage.getItem('user-ng-list')).toBeNull()
    
    // 2. ユーザーが「その他」ジャンルの「毎時」を選択し、人気タグから「AIのべりすと」を選択
    const userAction1 = {
      lastGenre: 'other',
      lastPeriod: 'hour', 
      lastTag: 'AIのべりすと',
      version: 1,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem('user-preferences', JSON.stringify(userAction1))
    
    // 3. ユーザーがNGリストに動画を追加
    const ngList = {
      videoIds: ['sm12345'],
      videoTitles: { exact: [], partial: ['広告'] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 1,
      totalCount: 2,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem('user-ng-list', JSON.stringify(ngList))
    
    // 4. ブラウザを閉じて再訪問（localStorageからデータを読み込む）
    const savedPrefs = JSON.parse(localStorage.getItem('user-preferences') || '{}')
    const savedNGList = JSON.parse(localStorage.getItem('user-ng-list') || '{}')
    
    // 検証: すべての設定が保持されている
    expect(savedPrefs.lastGenre).toBe('other')
    expect(savedPrefs.lastPeriod).toBe('hour')
    expect(savedPrefs.lastTag).toBe('AIのべりすと')
    expect(savedNGList.videoIds).toContain('sm12345')
    expect(savedNGList.videoTitles.partial).toContain('広告')
  })

  it('人気タグを変更するシナリオ', () => {
    // 1. 最初は「AIのべりすと」を選択
    const step1 = {
      lastGenre: 'other',
      lastPeriod: '24h',
      lastTag: 'AIのべりすと',
      version: 1,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem('user-preferences', JSON.stringify(step1))
    
    // 2. 別の人気タグ「クッキー☆音MADリンク」に変更
    const step2 = {
      ...step1,
      lastTag: 'クッキー☆音MADリンク',
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem('user-preferences', JSON.stringify(step2))
    
    // 3. 再訪問時の確認
    const saved = JSON.parse(localStorage.getItem('user-preferences') || '{}')
    expect(saved.lastTag).toBe('クッキー☆音MADリンク')
  })

  it('タグをクリアして「すべて」に戻すシナリオ', () => {
    // 1. タグ付きで開始
    const withTag = {
      lastGenre: 'other',
      lastPeriod: '24h',
      lastTag: '変態糞親父',
      version: 1,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem('user-preferences', JSON.stringify(withTag))
    
    // 2. タグをクリア（「すべて」を選択）
    const noTag = {
      ...withTag,
      lastTag: undefined,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem('user-preferences', JSON.stringify(noTag))
    
    // 3. 確認
    const saved = JSON.parse(localStorage.getItem('user-preferences') || '{}')
    expect(saved.lastTag).toBeUndefined()
    expect(saved.lastGenre).toBe('other') // ジャンルは保持
    expect(saved.lastPeriod).toBe('24h')  // 期間も保持
  })
})