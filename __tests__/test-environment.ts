// テスト環境の初期化を強制的に行う
export function forceTestEnvironmentInit() {
  // Document コンストラクタの設定
  if (typeof global !== 'undefined') {
    // JSDOMのwindowからDocumentを取得
    const win = global.window || (global as any).window
    if (win && win.Document && typeof Document === 'undefined') {
      (global as any).Document = win.Document
    }
    
    // navigatorの完全な設定
    const navigatorMock = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      vibrate: () => false,
      clipboard: {
        writeText: () => Promise.resolve(),
        readText: () => Promise.resolve(''),
        write: () => Promise.resolve(),
        read: () => Promise.resolve([])
      },
      vendor: 'Google Inc.',
      platform: 'Win32',
      language: 'ja-JP',
      languages: ['ja-JP', 'ja', 'en'],
      onLine: true,
      cookieEnabled: true,
      maxTouchPoints: 0,
      mediaDevices: {},
      permissions: {
        query: () => Promise.resolve({ state: 'granted' as PermissionState })
      }
    }
    
    // global.navigatorの設定
    if (!global.navigator) {
      Object.defineProperty(global, 'navigator', {
        value: navigatorMock,
        writable: true,
        configurable: true
      })
    }
    
    // window.navigatorの設定
    if (win && (!win.navigator || !win.navigator.clipboard)) {
      Object.defineProperty(win, 'navigator', {
        value: navigatorMock,
        writable: true,
        configurable: true
      })
    }
    
    // window.matchMediaの設定 - CI環境での安定性向上のため常に設定
    const matchMediaMock = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true
    })
    
    // 既存のmatchMediaがある場合も上書き（CI環境での不安定性対策）
    if (win) {
      Object.defineProperty(win, 'matchMedia', {
        value: matchMediaMock,
        writable: true,
        configurable: true,
        enumerable: true
      })
    }
    
    // globalにも設定
    if (typeof global !== 'undefined') {
      (global as any).matchMedia = matchMediaMock
    }
  }
}

// 即座に実行
forceTestEnvironmentInit()