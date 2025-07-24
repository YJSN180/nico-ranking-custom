// カスタムランキングのlocalStorageデータをテスト

// サンプルデータを作成
const testData = {
  rankings: [
    {
      id: "test-123",
      title: "テストカスタムランキング",
      baseGenre: "game",
      conditions: [
        { tag: "実況プレイ動画", operator: "AND", tagType: "both" },
        { tag: "ゆっくり実況プレイ", operator: "OR", tagType: "both" },
        { tag: "淫夢実況シリーズ", operator: "NOT", tagType: "both" }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ],
  selectedId: "test-123"
};

// Node.js環境では実行しない
if (typeof window !== 'undefined') {
  // localStorage にデータを保存
  localStorage.setItem('custom-rankings', JSON.stringify(testData));
  console.log('カスタムランキングのテストデータを保存しました:', testData);
  
  // 保存したデータを確認
  const saved = localStorage.getItem('custom-rankings');
  console.log('保存されたデータ:', JSON.parse(saved));
}