import { fetchRankingData } from '@/lib/data-fetcher'
import type { RankingData } from '@/types/ranking'

export const revalidate = 30

function RankingItem({ item }: { item: RankingData[number] }) {
  return (
    <li style={{ marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
      <div style={{ display: 'flex', gap: '15px' }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold', minWidth: '50px' }}>
          {item.rank}位
        </div>
        {item.thumbURL && (
          <img
            src={item.thumbURL}
            alt={item.title}
            width={100}
            height={56}
            style={{ objectFit: 'cover' }}
          />
        )}
        <div style={{ flex: 1 }}>
          <a
            href={`https://www.nicovideo.jp/watch/${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#0066cc', textDecoration: 'none' }}
          >
            {item.title}
          </a>
          <div style={{ color: '#666', fontSize: '14px', marginTop: '5px' }}>
            {item.views.toLocaleString()} 回再生
          </div>
        </div>
      </div>
    </li>
  )
}

export default async function Home() {
  try {
    const rankingData = await fetchRankingData()

    if (rankingData.length === 0) {
      return (
        <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
          <h1>ニコニコ24時間総合ランキング</h1>
          <p>ランキングデータがありません</p>
        </main>
      )
    }

    return (
      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <h1>ニコニコ24時間総合ランキング</h1>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rankingData.map((item) => (
            <RankingItem key={item.id} item={item} />
          ))}
        </ul>
      </main>
    )
  } catch (error) {
    return (
      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        <h1>ニコニコ24時間総合ランキング</h1>
        <p style={{ color: 'red' }}>ランキングデータの取得に失敗しました</p>
      </main>
    )
  }
}