// E2Eテスト用のモックデータ
export const mockRankingItems = [
  {
    id: 'sm12345678',
    rank: 1,
    title: '【初音ミク】テスト動画タイトル【オリジナル】',
    views: 123456,
    viewCount: 123456,
    comments: 567,
    commentCount: 567,
    likes: 890,
    mylistCount: 234,
    mylists: 234,
    thumbURL: 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/12345678/12345678.original/r1280x720l?key=test',
    authorName: 'テスト投稿者',
    authorId: 'user123',
    registeredAt: '2025-01-27T12:00:00+09:00',
    duration: 240,
    tags: ['VOCALOID', '初音ミク', 'ミクオリジナル曲'],
  },
  {
    id: 'sm87654321',
    rank: 2,
    title: 'ゲーム実況プレイ動画 Part1',
    views: 56789,
    viewCount: 56789,
    comments: 123,
    commentCount: 123,
    likes: 456,
    mylistCount: 78,
    mylists: 78,
    thumbURL: 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/87654321/87654321.original/r1280x720l?key=test',
    authorName: '実況者名',
    authorId: 'user456',
    registeredAt: '2025-01-27T10:30:00+09:00',
    duration: 1200,
    tags: ['ゲーム', '実況プレイ動画', 'ゲーム実況'],
  },
  {
    id: 'sm11223344',
    rank: 3,
    title: '料理動画 - 簡単レシピ',
    views: 34567,
    viewCount: 34567,
    comments: 89,
    commentCount: 89,
    likes: 234,
    mylistCount: 45,
    mylists: 45,
    thumbURL: 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/11223344/11223344.original/r1280x720l?key=test',
    authorName: '料理チャンネル',
    authorId: 'user789',
    registeredAt: '2025-01-27T08:00:00+09:00',
    duration: 600,
    tags: ['料理', 'レシピ', '簡単料理'],
  },
];

export const mockRankingData = {
  items: mockRankingItems,
  popularTags: ['VOCALOID', 'ゲーム実況', '料理', '歌ってみた', '踊ってみた'],
};

// マイリスト用のモックデータ
export const mockDefaultMylist = {
  id: 'default',
  name: 'とりあえずマイリスト',
  description: 'デフォルトのマイリストです',
  videoCount: 0,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

export const mockUserMylists = [
  mockDefaultMylist,
  {
    id: 'mylist-1',
    name: 'お気に入りの音楽',
    description: '好きな音楽をまとめました',
    videoCount: 5,
    createdAt: '2025-01-20T12:00:00Z',
    updatedAt: '2025-01-25T18:30:00Z',
  },
  {
    id: 'mylist-2',
    name: 'ゲーム実況',
    description: '面白いゲーム実況動画',
    videoCount: 3,
    createdAt: '2025-01-15T09:00:00Z',
    updatedAt: '2025-01-26T20:00:00Z',
  },
];