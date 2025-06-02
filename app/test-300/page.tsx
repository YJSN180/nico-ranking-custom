import ClientPage from '../client-page'

async function get300TestItems() {
  const response = await fetch('http://localhost:3000/api/test-300-items', {
    cache: 'no-store'
  })
  
  if (!response.ok) {
    return { items: [], popularTags: [] }
  }
  
  return await response.json()
}

export default async function Test300Page() {
  const { items, popularTags } = await get300TestItems()
  
  return (
    <div>
      <h1 style={{ textAlign: 'center', margin: '20px 0' }}>
        300件テストページ（{items.length}件のデータ）
      </h1>
      <ClientPage 
        initialData={items} 
        initialGenre="all"
        initialPeriod="24h"
        popularTags={popularTags}
      />
    </div>
  )
}