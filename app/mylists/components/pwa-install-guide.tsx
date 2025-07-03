'use client'

import styles from '../mylists.module.css'

export function PWAInstallGuide() {
  return (
    <div className={styles.pwaSection}>
      <h3>アプリとしてインストール</h3>
      <div className={styles.pwaContent}>
        <p>
          ホーム画面に追加すると、アプリのように素早く起動できます。
          マイリストデータ自体はオンラインでのみ表示されますが、
          アプリリソースのキャッシュにより快適な操作が可能です。
          特にSafariでは7日間アクセスがないとデータが削除されるため、
          ホーム画面からの定期的なアクセスが推奨されます。
        </p>
        
        <div className={styles.installMethods}>
          <div className={styles.methodCard}>
            <h4>📱 iOS/iPadOS (Safari)</h4>
            <ol>
              <li>Safari下部の共有ボタンをタップ</li>
              <li>「ホーム画面に追加」を選択</li>
              <li>右上の「追加」をタップ</li>
            </ol>
          </div>
          
          <div className={styles.methodCard}>
            <h4>🤖 Android (Chrome)</h4>
            <ol>
              <li>Chrome右上のメニュー（︙）をタップ</li>
              <li>「ホーム画面に追加」を選択</li>
              <li>「追加」をタップして完了</li>
            </ol>
          </div>
          
          <div className={styles.methodCard}>
            <h4>💻 デスクトップ</h4>
            <ol>
              <li>アドレスバー右端のインストールアイコンをクリック</li>
              <li>「インストール」をクリック</li>
              <li>アプリとして起動可能に</li>
            </ol>
          </div>
        </div>
        
        <div className={styles.benefits}>
          <h4>メリット</h4>
          <ul>
            <li>✅ アプリの起動が高速化（JS/CSSをキャッシュ）</li>
            <li>✅ 画像の表示が高速化（サムネイルを7日間キャッシュ）</li>
            <li>✅ ホーム画面から素早くアクセス</li>
            <li>✅ Safari 7日間データ削除の回避</li>
          </ul>
        </div>
      </div>
    </div>
  )
}