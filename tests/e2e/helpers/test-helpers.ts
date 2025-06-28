import { Page, Route } from '@playwright/test';
import { mockRankingData, mockUserMylists } from '../fixtures/mock-ranking-data';

/**
 * APIルートをモックする
 */
export async function mockAPIRoutes(page: Page) {
  // ランキングAPIのモック
  await page.route('**/api/ranking*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockRankingData),
    });
  });

  // 外部APIのモック（nico-rank.com）
  await page.route('https://nico-rank.com/api/ranking*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockRankingData),
    });
  });
}

/**
 * IndexedDBを高速化するためのセットアップ
 */
export async function setupIndexedDBMock(page: Page) {
  await page.addInitScript(() => {
    // IndexedDBの操作を高速化
    const originalOpen = indexedDB.open.bind(indexedDB);
    
    // @ts-ignore
    window.indexedDB.open = function(name: string, version?: number) {
      const request = originalOpen(name, version);
      
      // DBオープンを即座に成功させる
      const originalOnupgradeneeded = request.onupgradeneeded;
      const originalOnsuccess = request.onsuccess;
      
      request.onupgradeneeded = function(event: any) {
        if (originalOnupgradeneeded) {
          originalOnupgradeneeded.call(this, event);
        }
      };
      
      request.onsuccess = function(event: any) {
        if (originalOnsuccess) {
          originalOnsuccess.call(this, event);
        }
      };
      
      return request;
    };

    // console.logをモック（デバッグメッセージを抑制）
    const originalLog = console.log;
    console.log = function(...args: any[]) {
      if (!args[0]?.includes('[DBManager]') && !args[0]?.includes('[SSR]')) {
        originalLog.apply(console, args);
      }
    };
  });
}

/**
 * ページが完全に読み込まれるまで待機
 */
export async function waitForPageReady(page: Page) {
  // ネットワークアイドル状態を待つ
  await page.waitForLoadState('networkidle');
  
  // 追加の待機（IndexedDB初期化など）
  await page.waitForTimeout(200);
  
  // 読み込み中表示が消えるまで待つ
  const loadingIndicator = page.locator('text=読み込み中...');
  if (await loadingIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
    await loadingIndicator.waitFor({ state: 'hidden', timeout: 5000 });
  }
}

/**
 * マイリストボタンが表示されるまで待機
 */
export async function waitForMylistButtons(page: Page) {
  // 最初のランキングアイテムを待つ
  await page.waitForSelector('.ranking-item-responsive', { timeout: 10000 });
  
  // マイリストボタンが表示されるまで待つ（完全一致）
  await page.waitForSelector('button[aria-label="マイリストに追加"], button[aria-label="マイリストから削除"]', { timeout: 5000 });
}

/**
 * モバイルメニューを開く
 */
export async function openMobileMenu(page: Page) {
  const menuButton = page.locator('button[aria-label*="メニュー"]');
  if (await menuButton.isVisible()) {
    await menuButton.click();
    // メニューが開くアニメーションを待つ
    await page.waitForTimeout(300);
  }
}

/**
 * デバッグ情報を出力
 */
export async function logDebugInfo(page: Page, message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  
  // ページのコンソールログも取得
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`[Browser Error] ${msg.text()}`);
    }
  });
}

/**
 * テスト用のマイリストを作成
 */
export async function createTestMylist(page: Page, name: string, description: string = '') {
  // 新規マイリスト作成ボタンをクリック
  await page.click('button:has-text("新規マイリスト作成")');
  
  // モーダルが表示されるまで待つ
  await page.waitForSelector('text=新規マイリスト作成', { timeout: 5000 });
  
  // 名前を入力（プレースホルダー違い修正）
  await page.fill('input[placeholder="例: お気に入りの音楽"]', name);
  
  // 説明があれば入力
  if (description) {
    await page.fill('textarea[placeholder="このマイリストの説明を入力..."]', description);
  }
  
  // 作成ボタンをクリック（フォーム内のsubmitボタン）
  await page.locator('form button[type="submit"]:has-text("作成")').click();
  
  // モーダルが閉じるまで待つ
  await page.waitForSelector('text=新規マイリスト作成', { state: 'hidden', timeout: 5000 });
  
  await page.waitForTimeout(200); // 作成処理を待つ
}

/**
 * 動画をマイリストに追加
 */
export async function addVideoToMylist(page: Page, videoIndex: number = 0, mylistName: string = 'とりあえずマイリスト') {
  const rankingItem = page.locator('.ranking-item-responsive').nth(videoIndex);
  
  // マイリストボタンをクリック（aria-labelを使用）
  const mylistButton = rankingItem.locator('button[aria-label="マイリストに追加"]');
  await mylistButton.click();
  
  // モーダルが表示されるまで待つ
  await page.waitForSelector('text=マイリストに追加', { timeout: 5000 });
  
  // 指定されたマイリストを選択
  await page.locator('button').filter({ hasText: mylistName }).first().click();
  
  // モーダルが閉じるまで待つ
  await page.waitForSelector('text=マイリストに追加', { state: 'hidden', timeout: 5000 });
}