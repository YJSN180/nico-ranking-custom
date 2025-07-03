// Web Worker for off-main-thread ranking processing
// Reduces Script Evaluation time by moving heavy computations away from main thread

let cachedNGList = null;

// NG filtering logic (moved from main thread)
function filterRankings(rankings, ngList) {
  if (!ngList || !rankings || rankings.length === 0) {
    return rankings;
  }

  // Cache compiled regex patterns
  if (cachedNGList !== ngList) {
    cachedNGList = ngList;
    
    // Pre-compile regex patterns
    if (ngList.titles && Array.isArray(ngList.titles)) {
      ngList.compiledTitles = ngList.titles.map(pattern => {
        try {
          return new RegExp(pattern, 'i');
        } catch {
          return null;
        }
      }).filter(Boolean);
    }
    
    if (ngList.tags && Array.isArray(ngList.tags)) {
      ngList.compiledTags = ngList.tags.map(pattern => {
        try {
          return new RegExp(pattern, 'i');
        } catch {
          return null;
        }
      }).filter(Boolean);
    }
  }

  // Batch processing for better performance
  const batchSize = 100;
  const results = [];
  
  for (let i = 0; i < rankings.length; i += batchSize) {
    const batch = rankings.slice(i, i + batchSize);
    const filteredBatch = batch.filter(item => {
      // Title filtering
      if (ngList.compiledTitles?.length > 0) {
        const titleMatch = ngList.compiledTitles.some(regex => 
          regex.test(item.title)
        );
        if (titleMatch) return false;
      }

      // Tag filtering
      if (ngList.compiledTags?.length > 0 && item.tags) {
        const tagMatch = item.tags.some(tag =>
          ngList.compiledTags.some(regex => regex.test(tag))
        );
        if (tagMatch) return false;
      }

      // User filtering
      if (ngList.users?.length > 0 && item.userId) {
        if (ngList.users.includes(item.userId)) return false;
      }

      // Video ID filtering
      if (ngList.videoIds?.length > 0) {
        if (ngList.videoIds.includes(item.id)) return false;
      }

      return true;
    });
    
    results.push(...filteredBatch);
  }

  return results;
}

// Sorting logic (moved from main thread)
function sortRankings(rankings, sortBy = 'rank') {
  const sorted = [...rankings];
  
  switch (sortBy) {
    case 'views':
      return sorted.sort((a, b) => b.viewCount - a.viewCount);
    case 'comments':
      return sorted.sort((a, b) => b.commentCount - a.commentCount);
    case 'mylists':
      return sorted.sort((a, b) => b.mylistCount - a.mylistCount);
    case 'date':
      return sorted.sort((a, b) => 
        new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
      );
    default:
      return sorted; // Already sorted by rank
  }
}

// Search logic (moved from main thread)
function searchRankings(rankings, query) {
  if (!query || query.trim() === '') {
    return rankings;
  }

  const searchTerms = query.toLowerCase().split(/\s+/);
  
  return rankings.filter(item => {
    const searchText = [
      item.title,
      ...(item.tags || []),
      item.id
    ].join(' ').toLowerCase();
    
    return searchTerms.every(term => searchText.includes(term));
  });
}

// Message handler
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'FILTER_RANKINGS': {
      const { rankings, ngList } = payload;
      const filtered = filterRankings(rankings, ngList);
      
      self.postMessage({
        type: 'FILTER_COMPLETE',
        payload: { filtered }
      });
      break;
    }

    case 'SORT_RANKINGS': {
      const { rankings, sortBy } = payload;
      const sorted = sortRankings(rankings, sortBy);
      
      self.postMessage({
        type: 'SORT_COMPLETE',
        payload: { sorted }
      });
      break;
    }

    case 'SEARCH_RANKINGS': {
      const { rankings, query } = payload;
      const results = searchRankings(rankings, query);
      
      self.postMessage({
        type: 'SEARCH_COMPLETE',
        payload: { results }
      });
      break;
    }

    case 'PROCESS_BATCH': {
      const { rankings, ngList, sortBy, query } = payload;
      let processed = rankings;
      
      // Apply filters in sequence
      if (ngList) {
        processed = filterRankings(processed, ngList);
      }
      
      if (query) {
        processed = searchRankings(processed, query);
      }
      
      if (sortBy) {
        processed = sortRankings(processed, sortBy);
      }
      
      self.postMessage({
        type: 'PROCESS_COMPLETE',
        payload: { processed }
      });
      break;
    }

    default:
      console.warn('Unknown message type:', type);
  }
});

// Preload message for immediate availability
self.postMessage({ type: 'WORKER_READY' });