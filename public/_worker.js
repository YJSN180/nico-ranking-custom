export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // API routing
    if (url.pathname.startsWith('/api/ranking')) {
      // Handle ranking API
      return handleRankingAPI(request, env);
    }
    
    // Pass through to static assets
    return env.ASSETS.fetch(request);
  }
};

async function handleRankingAPI(request, env) {
  const { ungzip } = await import('pako');
  const url = new URL(request.url);
  
  const genre = url.searchParams.get('genre') || 'all';
  const period = url.searchParams.get('period') || '24h';
  const tag = url.searchParams.get('tag') || undefined;
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  
  // Validate inputs
  const validPeriods = ['24h', 'hour'];
  if (!validPeriods.includes(period)) {
    return new Response(JSON.stringify({ error: 'Invalid period' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // Get data from KV
    const compressed = await env.RANKING_KV.get('RANKING_LATEST', { type: 'arrayBuffer' });
    
    if (!compressed) {
      return new Response(JSON.stringify({ error: 'No ranking data available' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Decompress
    const decompressed = ungzip(new Uint8Array(compressed));
    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(decompressed);
    const snapshot = JSON.parse(jsonStr);
    
    // Get genre and period data
    const genreData = snapshot.genres?.[genre];
    if (!genreData) {
      return new Response(JSON.stringify({ error: 'Genre not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const periodData = genreData[period];
    if (!periodData) {
      return new Response(JSON.stringify({ error: 'Period not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    let items = [];
    let popularTags = periodData.popularTags || [];
    
    // Handle tag filtering
    if (tag) {
      const tagData = periodData.tags?.[tag];
      if (tagData && Array.isArray(tagData)) {
        items = tagData;
      } else {
        items = (periodData.items || []).filter((item) =>
          item.tags?.includes(tag)
        );
      }
    } else {
      items = periodData.items || [];
    }
    
    // Pagination
    const itemsPerPage = 100;
    const startIdx = (page - 1) * itemsPerPage;
    const endIdx = page * itemsPerPage;
    const pageItems = items.slice(startIdx, endIdx);
    
    // Calculate hasMore flag
    const hasMore = endIdx < items.length;
    
    // Build response
    const responseData = {
      items: pageItems,
      hasMore,
      totalItems: items.length
    };
    
    // Include popular tags on first page without tag filter
    if (page === 1 && !tag) {
      responseData.popularTags = popularTags;
    }
    
    return new Response(JSON.stringify(responseData), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Cache-Status': 'HIT',
        'X-Total-Items': items.length.toString()
      }
    });
    
  } catch (error) {
    console.error('Error in ranking API:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch ranking data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}