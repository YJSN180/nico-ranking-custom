/**
 * Extract unique video IDs from ranking data
 * @param {Object} rankingData - The ranking data from R2
 * @returns {string[]} Array of unique video IDs
 */
export function extractUniqueVideoIds(rankingData) {
  const videoIds = new Set();
  
  if (!rankingData?.genres) {
    return [];
  }
  
  // Iterate through all genres
  Object.values(rankingData.genres).forEach(genreData => {
    // Check both 24h and hour periods
    ['24h', 'hour'].forEach(period => {
      const items = genreData?.[period]?.items || [];
      items.forEach(item => {
        if (item?.id) {
          videoIds.add(item.id);
        }
      });
    });
  });
  
  return Array.from(videoIds);
}

/**
 * Parse video tags from space-separated string
 * @param {string|null|undefined} tagsString - Space-separated tags
 * @returns {string[]} Array of tags
 */
export function parseVideoTags(tagsString) {
  if (!tagsString) {
    return [];
  }
  
  return tagsString.trim().split(/\s+/).filter(tag => tag.length > 0);
}

/**
 * Build Snapshot API URL for fetching video stats
 * @param {string[]} videoIds - Array of video IDs
 * @returns {string} API URL
 */
export function buildSnapshotAPIUrl(videoIds) {
  const baseUrl = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search';
  
  // Build jsonFilter for querying multiple videos
  const filters = videoIds.map(id => ({
    type: 'equal',
    field: 'contentId',
    value: id,
  }));
  
  const jsonFilter = {
    type: 'or',
    filters: filters,
  };
  
  const params = new URLSearchParams({
    q: '',  // Empty query since we're using jsonFilter
    targets: 'title',
    fields: 'contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,tags',
    _sort: '-viewCounter',
    _limit: videoIds.length.toString(),
    jsonFilter: JSON.stringify(jsonFilter),
  });
  
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Process Snapshot API response into video stats format
 * @param {Object} response - API response
 * @returns {Object} Video stats indexed by video ID
 */
export function processSnapshotResponse(response) {
  const stats = {};
  
  if (!response?.data || !Array.isArray(response.data)) {
    return stats;
  }
  
  response.data.forEach(video => {
    if (!video.contentId) {
      return;
    }
    
    stats[video.contentId] = {
      viewCounter: video.viewCounter || 0,
      commentCounter: video.commentCounter || 0,
      mylistCounter: video.mylistCounter || 0,
      likeCounter: video.likeCounter || 0,
      tags: parseVideoTags(video.tags),
    };
  });
  
  return stats;
}

/**
 * Batch array into chunks
 * @param {Array} array - Array to batch
 * @param {number} batchSize - Size of each batch
 * @returns {Array[]} Array of batches
 */
export function batchArray(array, batchSize) {
  const batches = [];
  
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  
  return batches;
}