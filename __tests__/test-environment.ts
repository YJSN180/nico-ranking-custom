// テスト環境の初期化を強制的に行う
export function forceTestEnvironmentInit() {
  // Document コンストラクタの設定
  if (typeof global !== 'undefined') {
    // JSDOMのwindowからDocumentを取得
    const win = global.window || (global as any).window
    if (win && win.Document && typeof Document === 'undefined') {
      (global as any).Document = win.Document
    }
    
    // Ensure document structure exists
    if (win && win.document) {
      if (!win.document.documentElement) {
        const html = win.document.createElement('html')
        win.document.appendChild(html)
      }
      if (!win.document.head) {
        const head = win.document.createElement('head')
        win.document.documentElement.appendChild(head)
      }
      if (!win.document.body) {
        const body = win.document.createElement('body')
        win.document.documentElement.appendChild(body)
      }
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
    const matchMediaMock = (query: string) => {
      // Ensure the mock function always returns a valid object
      const result = {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true
      }
      return result
    }
    
    // 既存のmatchMediaがある場合も上書き（CI環境での不安定性対策）
    if (win) {
      Object.defineProperty(win, 'matchMedia', {
        value: matchMediaMock,
        writable: false,  // Make it non-writable to prevent accidental deletion
        configurable: false,  // Make it non-configurable to prevent redefinition
        enumerable: true
      })
    }
    
    // globalにも設定
    if (typeof global !== 'undefined') {
      Object.defineProperty(global, 'matchMedia', {
        value: matchMediaMock,
        writable: false,
        configurable: false,
        enumerable: true
      })
    }
  }
}

// 即座に実行
forceTestEnvironmentInit()