export const getFAQStructuredData = () => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'ニコラン(Re:turn)とは何ですか？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'ニコラン(Re:turn)は、ニコニコ動画のランキングを高速で閲覧できる非公式サービスです。30分ごとに更新され、NGフィルター機能やタグ別ランキングなど、公式にはない便利な機能を提供しています。'
      }
    },
    {
      '@type': 'Question',
      name: 'NGフィルター機能とは何ですか？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '特定の動画ID、タイトル、投稿者をフィルタリングして、表示したくない動画をランキングから除外できる機能です。設定はブラウザに保存され、次回アクセス時も維持されます。'
      }
    },
    {
      '@type': 'Question',
      name: '公式のニコニコランキングとの違いは？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'ニコラン(Re:turn)は、1) 広告なしで高速表示、2) NGフィルター機能、3) タグ別ランキングの詳細表示、4) モバイル最適化されたUI、という点で公式と差別化されています。'
      }
    },
    {
      '@type': 'Question',
      name: 'データはどのくらいの頻度で更新されますか？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'ランキングデータは30分ごとに自動更新されます。また、動画の再生数やコメント数などの統計情報は3分ごとにリアルタイム更新されます。'
      }
    }
  ]
})