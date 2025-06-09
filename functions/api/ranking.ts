/// <reference path="../../env.d.ts" />

import { ungzip } from 'pako';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
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
    // Cloudflare KVから直接データを取得
    const compressed = await env.RANKING_KV.get('RANKING_LATEST', { type: 'arrayBuffer' });
    
    if (!compressed) {
      return new Response(JSON.stringify({ error: 'No ranking data available' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 解凍
    const decompressed = ungzip(new Uint8Array(compressed));
    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(decompressed);
    const snapshot = JSON.parse(jsonStr);
    
    // ジャンルとピリオドのデータを取得
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
    
    // タグ指定がある場合
    if (tag) {
      const tagData = periodData.tags?.[tag];
      if (tagData && Array.isArray(tagData)) {
        items = tagData;
      } else {
        items = (periodData.items || []).filter((item: any) =>
          item.tags?.includes(tag)
        );
      }
    } else {
      items = periodData.items || [];
    }
    
    // ページネーション処理
    const itemsPerPage = 100;
    const startIdx = (page - 1) * itemsPerPage;
    const endIdx = page * itemsPerPage;
    const pageItems = items.slice(startIdx, endIdx);
    
    // hasMoreフラグを計算
    const hasMore = endIdx < items.length;
    
    // レスポンスを構築
    const responseData: any = {
      items: pageItems,
      hasMore,
      totalItems: items.length
    };
    
    // ページ1でタグ指定がない場合は人気タグも返す
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
};