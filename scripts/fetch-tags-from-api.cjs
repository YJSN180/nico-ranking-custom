// APIから直接ランキングデータを取得してタグを収集
const fs = require('fs');
const path = require('path');

// 全23ジャンル（ALL_GENRESから取得）
const genres = [
  'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
  'entertainment', 'music', 'sing', 'dance', 'play',
  'commentary', 'cooking', 'travel', 'nature', 'vehicle',
  'technology', 'society', 'mmd', 'vtuber', 'radio',
  'sports', 'animal', 'other'
];
const periods = ['24h', 'hour'];

async function fetchRankingData(genre, period) {
  try {
    const url = `https://nico-rank.com/api/ranking?genre=${genre}&period=${period}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch ${genre}/${period}: ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${genre}/${period}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('📊 APIからタグデータを収集開始...');
  
  const tagSet = new Set();
  const tagFrequency = new Map();
  let totalProcessed = 0;

  for (const genre of genres) {
    for (const period of periods) {
      console.log(`📡 Fetching ${genre}/${period}...`);
      const data = await fetchRankingData(genre, period);
      
      if (data && data.items) {
        for (const item of data.items) {
          // tagDetailsから抽出（優先）
          if (item.tagDetails && Array.isArray(item.tagDetails)) {
            for (const tagDetail of item.tagDetails) {
              if (tagDetail.name) {
                tagSet.add(tagDetail.name);
                tagFrequency.set(tagDetail.name, (tagFrequency.get(tagDetail.name) || 0) + 1);
              }
            }
          }
          // tagsから抽出（フォールバック）
          else if (item.tags && Array.isArray(item.tags)) {
            for (const tag of item.tags) {
              if (tag) {
                tagSet.add(tag);
                tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1);
              }
            }
          }
        }
        totalProcessed += data.items.length;
      }
      
      // レート制限対策（20リクエスト/分 = 3秒/リクエスト）
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // 頻度順にソート
  const sortedTags = Array.from(tagSet).sort((a, b) => {
    const freqA = tagFrequency.get(a) || 0;
    const freqB = tagFrequency.get(b) || 0;
    return freqB - freqA;
  });

  // タグ累積データを作成
  const tagAccumulationData = {
    tags: sortedTags,
    metadata: {
      version: 2,
      lastUpdated: new Date().toISOString(),
      totalUniqueTags: sortedTags.length,
      lastAccumulationSource: 'api-fetch',
      weeklyUpdateCount: totalProcessed
    }
  };

  console.log(`✅ ${sortedTags.length}個のユニークなタグを収集`);
  console.log('📊 上位20タグ:');
  sortedTags.slice(0, 20).forEach((tag, index) => {
    console.log(`   ${index + 1}. ${tag} (${tagFrequency.get(tag)}回)`);
  });

  // dataディレクトリを作成
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // ファイルに保存
  const outputPath = path.join(dataDir, 'tag-accumulation.json');
  fs.writeFileSync(outputPath, JSON.stringify(tagAccumulationData, null, 2));
  console.log(`💾 ${outputPath} に保存しました`);
}

main().catch(console.error);