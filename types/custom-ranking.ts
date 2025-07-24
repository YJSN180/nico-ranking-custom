// カスタムランキングの型定義

import { RankingGenre } from './ranking-config'

// タグ条件の演算子
export type TagOperator = 'AND' | 'OR' | 'NOT'

// 個別のタグ条件
export interface TagCondition {
  tag: string              // タグ名
  operator: TagOperator    // 条件演算子
}

// カスタムランキングの定義
export interface CustomRanking {
  id: string                    // UUID
  title: string                 // ユーザー定義のタイトル
  baseGenre: RankingGenre       // ベースとなるジャンル（custom以外）
  conditions: TagCondition[]    // タグ条件の配列
  createdAt: number            // 作成日時（Unix timestamp）
  updatedAt: number            // 更新日時（Unix timestamp）
}

// LocalStorageに保存するデータ構造
export interface CustomRankingStorage {
  rankings: CustomRanking[]     // 保存されているカスタムランキング一覧
  selectedId?: string          // 現在選択中のカスタムランキングID
}

// カスタムランキング作成フォームの状態
export interface CustomRankingFormState {
  baseGenre?: RankingGenre     // Step 1: ベースジャンル
  conditions: TagCondition[]   // Step 2: タグ条件
  title: string               // Step 3: タイトル
}

// モーダルのステップ
export type ModalStep = 1 | 2 | 3

// タグサジェスション用の型
export interface TagSuggestion {
  tag: string         // タグ名
  count: number      // 使用回数
}