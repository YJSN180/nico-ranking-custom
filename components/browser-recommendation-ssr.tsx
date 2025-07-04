import { BrowserRecommendationOnce } from './browser-recommendation-once'

/**
 * SSR対応ブラウザ推奨コンポーネント
 * 初回訪問時のみ表示される注意書きコンポーネントをインポート
 */
export async function BrowserRecommendationSSR() {
  // ブラウザ判定は不要になったため、常にクライアントコンポーネントを返す
  return <BrowserRecommendationOnce />
}