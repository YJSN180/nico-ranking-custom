import { describe, it, expect } from 'vitest'

// Test the migration logic specifically
describe('NG List Migration', () => {
  // Replicate migration function from cron script
  function migrateLegacyNGList(data: any) {
    // If already in new format, return as-is
    if (data && data.videoTitles && typeof data.videoTitles === 'object' && Array.isArray(data.videoTitles.exact)) {
      return data;
    }
    
    // Convert legacy format to new structure
    return {
      videoIds: data?.videoIds || [],
      videoTitles: {
        exact: data?.videoTitles || [],
        partial: []
      },
      authorIds: data?.authorIds || [],
      authorNames: {
        exact: data?.authorNames || [],
        partial: []
      },
      derivedVideoIds: data?.derivedVideoIds || []
    };
  }

  it('should migrate legacy NG list format to new structure', () => {
    const legacyNGList = {
      videoIds: ['sm1001', 'sm1002'],
      videoTitles: ['Bad Title 1', 'Bad Title 2'],
      authorIds: ['user123', 'user456'],
      authorNames: ['BadAuthor1', 'BadAuthor2'],
      derivedVideoIds: ['sm2001', 'sm2002']
    };

    const migrated = migrateLegacyNGList(legacyNGList);

    expect(migrated).toEqual({
      videoIds: ['sm1001', 'sm1002'],
      videoTitles: {
        exact: ['Bad Title 1', 'Bad Title 2'],
        partial: []
      },
      authorIds: ['user123', 'user456'],
      authorNames: {
        exact: ['BadAuthor1', 'BadAuthor2'],
        partial: []
      },
      derivedVideoIds: ['sm2001', 'sm2002']
    });
  });

  it('should handle already migrated NG list', () => {
    const newFormatNGList = {
      videoIds: ['sm1001'],
      videoTitles: {
        exact: ['Bad Title'],
        partial: ['spam']
      },
      authorIds: ['user123'],
      authorNames: {
        exact: ['BadAuthor'],
        partial: ['Spam']
      },
      derivedVideoIds: ['sm2001']
    };

    const migrated = migrateLegacyNGList(newFormatNGList);

    // Should return the same object unchanged
    expect(migrated).toEqual(newFormatNGList);
  });

  it('should handle missing or null data', () => {
    const migrated = migrateLegacyNGList(null);

    expect(migrated).toEqual({
      videoIds: [],
      videoTitles: {
        exact: [],
        partial: []
      },
      authorIds: [],
      authorNames: {
        exact: [],
        partial: []
      },
      derivedVideoIds: []
    });
  });

  it('should handle partial legacy data', () => {
    const partialLegacyData = {
      videoIds: ['sm1001'],
      authorIds: ['user123']
      // Missing videoTitles, authorNames, derivedVideoIds
    };

    const migrated = migrateLegacyNGList(partialLegacyData);

    expect(migrated).toEqual({
      videoIds: ['sm1001'],
      videoTitles: {
        exact: [],
        partial: []
      },
      authorIds: ['user123'],
      authorNames: {
        exact: [],
        partial: []
      },
      derivedVideoIds: []
    });
  });
})