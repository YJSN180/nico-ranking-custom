'use client'

import { useState } from 'react'

export function SafariHelpButton() {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="safari-help-button"
        data-testid="safari-help-button"
        title="Safari向けのヘルプ"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Safari対策ガイド
      </button>

      {showModal && (
        <SafariHelpModal onClose={() => setShowModal(false)} />
      )}

      <style jsx>{`
        .safari-help-button {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .safari-help-button:hover {
          background: var(--bg-hover);
          border-color: var(--primary-color);
        }

        .safari-help-button svg {
          width: 18px;
          height: 18px;
        }
      `}</style>
    </>
  )
}

function SafariHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="help-modal" 
        onClick={(e) => e.stopPropagation()}
        data-testid="safari-help-modal"
      >
        <div className="modal-header">
          <h2>Safari向けIndexedDB対策ガイド</h2>
          <button onClick={onClose} className="close-button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-content">
          <section>
            <h3>📱 Safariの7日間制限について</h3>
            <p>
              Safariブラウザでは、IndexedDBに保存されたデータが7日間アクセスされないと
              自動的に削除される仕様があります。これはプライバシー保護のための機能ですが、
              大切なマイリストデータが失われる可能性があります。
            </p>
          </section>

          <section>
            <h3>🛡️ データを守る対策</h3>
            <ol>
              <li>
                <strong>定期的なアクセス</strong>
                <p>週に1回以上、このサイトにアクセスしてください。アクセスするだけでタイマーがリセットされます。</p>
              </li>
              <li>
                <strong>データの永続化を要求</strong>
                <p>「データ永続化を要求」ボタンをクリックして、ブラウザに永続化を許可してもらいます。
                （ただし、Safariでは必ずしも許可されるとは限りません）</p>
              </li>
              <li>
                <strong>定期的なバックアップ</strong>
                <p>エクスポート機能を使って、マイリストデータを定期的にバックアップしてください。</p>
              </li>
            </ol>
          </section>

          <section>
            <h3>💾 バックアップ方法</h3>
            <div className="backup-steps">
              <div className="step">
                <span className="step-number">1</span>
                <div>
                  <strong>エクスポート</strong>
                  <p>マイリストページの「エクスポート」ボタンをクリック</p>
                </div>
              </div>
              <div className="step">
                <span className="step-number">2</span>
                <div>
                  <strong>ダウンロード</strong>
                  <p>JSONファイルがダウンロードされます</p>
                </div>
              </div>
              <div className="step">
                <span className="step-number">3</span>
                <div>
                  <strong>保管</strong>
                  <p>ファイルを安全な場所に保管してください</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3>🔄 データの復元方法</h3>
            <p>
              データが削除されてしまった場合は、「インポート」ボタンから
              バックアップファイルを選択することで復元できます。
            </p>
          </section>

          <section className="tips">
            <h3>💡 おすすめの設定</h3>
            <ul>
              <li>バックアップリマインダーを「5日ごと」に設定</li>
              <li>ホーム画面にアプリを追加して定期的に起動</li>
              <li>重要なマイリストは特に頻繁にバックアップ</li>
            </ul>
          </section>
        </div>

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            padding: 1rem;
            overflow-y: auto;
          }

          .help-modal {
            background: var(--bg-primary);
            border-radius: 16px;
            max-width: 600px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }

          .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1.5rem 2rem;
            border-bottom: 1px solid var(--border-color);
            position: sticky;
            top: 0;
            background: var(--bg-primary);
            z-index: 1;
          }

          .modal-header h2 {
            margin: 0;
            font-size: 1.5rem;
            color: var(--text-primary);
          }

          .close-button {
            width: 32px;
            height: 32px;
            padding: 0;
            border: none;
            background: transparent;
            color: var(--text-secondary);
            cursor: pointer;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          }

          .close-button:hover {
            background: var(--bg-secondary);
            color: var(--text-primary);
          }

          .close-button svg {
            width: 20px;
            height: 20px;
          }

          .modal-content {
            padding: 2rem;
          }

          .modal-content section {
            margin-bottom: 2rem;
          }

          .modal-content section:last-child {
            margin-bottom: 0;
          }

          .modal-content h3 {
            margin: 0 0 1rem;
            font-size: 1.125rem;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }

          .modal-content p {
            margin: 0 0 1rem;
            color: var(--text-primary);
            line-height: 1.6;
          }

          .modal-content ol,
          .modal-content ul {
            margin: 0;
            padding-left: 1.5rem;
          }

          .modal-content li {
            margin-bottom: 1rem;
            color: var(--text-primary);
          }

          .modal-content li strong {
            display: block;
            margin-bottom: 0.25rem;
            color: var(--text-primary);
          }

          .modal-content li p {
            margin: 0;
            color: var(--text-secondary);
            font-size: 0.875rem;
          }

          .backup-steps {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            margin-top: 1rem;
          }

          .step {
            display: flex;
            gap: 1rem;
            align-items: flex-start;
          }

          .step-number {
            width: 32px;
            height: 32px;
            background: var(--primary-color);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            flex-shrink: 0;
          }

          .step strong {
            display: block;
            margin-bottom: 0.25rem;
            color: var(--text-primary);
          }

          .step p {
            margin: 0;
            font-size: 0.875rem;
            color: var(--text-secondary);
          }

          .tips {
            background: var(--bg-secondary);
            border-radius: 12px;
            padding: 1.5rem;
          }

          .tips ul {
            margin-bottom: 0;
          }

          .tips li {
            margin-bottom: 0.5rem;
            font-size: 0.875rem;
          }

          .tips li:last-child {
            margin-bottom: 0;
          }

          @media (max-width: 768px) {
            .help-modal {
              max-height: 100vh;
              border-radius: 0;
            }

            .modal-header {
              padding: 1rem 1.5rem;
            }

            .modal-header h2 {
              font-size: 1.25rem;
            }

            .modal-content {
              padding: 1.5rem;
            }
          }
        `}</style>
      </div>
    </div>
  )
}