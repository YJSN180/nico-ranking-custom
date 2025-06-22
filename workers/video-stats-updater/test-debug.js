// Debug script for testing Worker functionality
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (url.pathname === '/debug') {
      try {
        console.log('[Debug] Starting debug check...');
        
        // 1. Check R2 metadata
        const metadataObject = await env.R2_BUCKET.get('rankings/metadata.json');
        const hasMetadata = !!metadataObject;
        let metadata = null;
        
        if (hasMetadata) {
          const metadataText = await metadataObject.text();
          metadata = JSON.parse(metadataText);
        }
        
        // 2. Check sample ranking data
        let sampleData = null;
        let sampleDataKey = 'rankings/all/24h/all.json';
        const sampleObject = await env.R2_BUCKET.get(sampleDataKey);
        
        if (sampleObject) {
          const sampleText = await sampleObject.text();
          sampleData = JSON.parse(sampleText);
        }
        
        // 3. Check KV current state
        const kvData = await env.STATS_KV.get('VIDEO_STATS_LATEST');
        let kvStats = null;
        
        if (kvData) {
          kvStats = JSON.parse(kvData);
        }
        
        // 4. List R2 objects
        const r2List = await env.R2_BUCKET.list({ prefix: 'rankings/', limit: 10 });
        
        return new Response(JSON.stringify({
          timestamp: new Date().toISOString(),
          r2: {
            hasMetadata,
            metadata: metadata ? {
              genres: metadata.genres,
              periods: metadata.periods,
              updatedAt: metadata.updatedAt
            } : null,
            sampleData: sampleData ? {
              itemsCount: sampleData.items?.length || 0,
              firstItem: sampleData.items?.[0] || null
            } : null,
            objectsList: r2List.objects.map(obj => ({
              key: obj.key,
              size: obj.size,
              uploaded: obj.uploaded
            }))
          },
          kv: {
            hasData: !!kvStats,
            stats: kvStats ? {
              totalVideos: kvStats.metadata?.totalVideos || 0,
              updatedAt: kvStats.metadata?.updatedAt || null,
              sampleVideoIds: Object.keys(kvStats.stats || {}).slice(0, 5)
            } : null
          }
        }, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
        
      } catch (error) {
        return new Response(JSON.stringify({
          error: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }
    
    // Run the actual scheduled task manually
    if (url.pathname === '/run') {
      const { scheduled } = await import('./src/index.js');
      
      try {
        await scheduled.default.scheduled({}, env, ctx);
        
        // Get updated KV data
        const kvData = await env.STATS_KV.get('VIDEO_STATS_LATEST');
        const kvStats = kvData ? JSON.parse(kvData) : null;
        
        return new Response(JSON.stringify({
          success: true,
          timestamp: new Date().toISOString(),
          result: {
            totalVideos: kvStats?.metadata?.totalVideos || 0,
            updatedAt: kvStats?.metadata?.updatedAt || null
          }
        }, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }
    
    return new Response('Debug endpoints: /debug, /run', {
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
};