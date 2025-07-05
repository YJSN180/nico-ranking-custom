// 修正版: メタデータAPIのgzipデコード処理を追加

// 既存のコードの/api/metadataセクションを以下に置き換え:

    // /api/metadata パスの処理（メタデータを返す）
    if (url.pathname === '/api/metadata' && env.R2_BUCKET) {
      try {
        const metadataObject = await env.R2_BUCKET.get('rankings/metadata.json')
        if (metadataObject) {
          const { cacheControl } = calculateDynamicTTL()
          
          // gzip圧縮チェック
          const contentEncoding = metadataObject.httpMetadata?.contentEncoding
          let metadataText: string
          
          if (contentEncoding === 'gzip') {
            console.log('[Worker] Metadata is gzipped, decompressing...')
            try {
              // gzip解凍
              const compressedData = await metadataObject.arrayBuffer()
              metadataText = await new Response(
                new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('gzip'))
              ).text()
            } catch (decompressError) {
              console.error('[Worker] Failed to decompress metadata:', decompressError)
              // 解凍失敗時は生データを返す
              metadataText = await metadataObject.text()
            }
          } else {
            // 非圧縮データ
            metadataText = await metadataObject.text()
          }
          
          return new Response(metadataText, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': cacheControl,
              'ETag': metadataObject.httpEtag || `"${metadataObject.etag}"`,
              ...getCorsHeaders(request),
              ...securityHeaders
            }
          })
        }
      } catch (error) {
        console.error('Metadata read error:', error)
      }
      
      // メタデータが存在しない場合は空のJSONを返す
      return new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(request),
          ...securityHeaders
        }
      })
    }