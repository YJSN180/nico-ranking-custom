/**
 * 日次人気タグバックアップのストレージ要件分析
 */

// 現在の使用状況
const CURRENT_USAGE = {
  // メインランキングデータ
  cachedGenres: 7,
  periods: 2,
  itemsPerRanking: 300,
  bytesPerItem: 500, // 推定値（タイトル、サムネURL、統計情報など）
  
  // その他ジャンルのタグランキング（事前キャッシュ）
  otherGenreTags: 15,
  itemsPerTag: 300,
  
  // その他のKVエントリ
  miscEntries: 10, // last-update-info, ng-list など
  bytesPerMiscEntry: 1000
}

// 提案される日次バックアップ
const DAILY_BACKUP_PROPOSAL = {
  totalGenres: 23,
  tagsPerGenre: 10,
  daysToKeep: 30,
  bytesPerTagEntry: 50 // タグ名の平均サイズ
}

// Vercel KV制限
const VERCEL_LIMITS = {
  free: {
    storage: 256 * 1024 * 1024, // 256MB
    monthlyCommands: 30000,
    dailyCommands: 3000
  },
  pro: {
    storage: 1024 * 1024 * 1024, // 1GB
    monthlyCommands: 1000000,
    dailyCommands: 100000
  }
}

function calculateCurrentUsage() {
  const { cachedGenres, periods, itemsPerRanking, bytesPerItem, otherGenreTags, itemsPerTag, miscEntries, bytesPerMiscEntry } = CURRENT_USAGE
  
  // メインランキングのストレージ
  const mainRankingItems = cachedGenres * periods * itemsPerRanking
  const mainRankingBytes = mainRankingItems * bytesPerItem
  
  // タグランキングのストレージ
  const tagRankingItems = otherGenreTags * itemsPerTag
  const tagRankingBytes = tagRankingItems * bytesPerItem
  
  // その他のエントリ
  const miscBytes = miscEntries * bytesPerMiscEntry
  
  // 合計
  const totalItems = mainRankingItems + tagRankingItems
  const totalBytes = mainRankingBytes + tagRankingBytes + miscBytes
  
  return {
    mainRankingItems,
    mainRankingBytes,
    tagRankingItems,
    tagRankingBytes,
    totalItems,
    totalBytes,
    totalMB: totalBytes / (1024 * 1024)
  }
}

function calculateDailyBackupRequirements() {
  const { totalGenres, tagsPerGenre, daysToKeep, bytesPerTagEntry } = DAILY_BACKUP_PROPOSAL
  
  // 1日分のバックアップデータ
  const tagsPerDay = totalGenres * tagsPerGenre
  const bytesPerDay = tagsPerDay * bytesPerTagEntry + 200 // メタデータ含む
  
  // 全期間のバックアップデータ
  const totalBackupEntries = daysToKeep // 日次でキーを分ける場合
  const totalBackupBytes = bytesPerDay * daysToKeep
  
  // KVコマンド数（日次更新）
  const writesPerDay = totalGenres // ジャンルごとに1回の書き込み
  const readsPerDay = 50 // 推定アクセス数
  
  return {
    tagsPerDay,
    bytesPerDay,
    totalBackupEntries,
    totalBackupBytes,
    totalBackupMB: totalBackupBytes / (1024 * 1024),
    writesPerDay,
    readsPerDay,
    commandsPerDay: writesPerDay + readsPerDay
  }
}

function analyzeAlternativeApproaches() {
  return [
    {
      approach: "圧縮された単一エントリ",
      description: "全ジャンルのタグを1つのJSONにまとめて保存",
      pros: ["KVエントリ数が少ない", "管理が簡単"],
      cons: ["部分的な更新が困難", "読み込み時に全データをパース"]
    },
    {
      approach: "週次サマリー",
      description: "日次ではなく週次でサマリーを保存",
      pros: ["ストレージ使用量が1/7", "長期トレンド分析に適切"],
      cons: ["日次の細かい変化が失われる"]
    },
    {
      approach: "人気上位タグのみ",
      description: "各ジャンルの上位5タグのみ保存",
      pros: ["ストレージ使用量が半減", "重要なタグに集中"],
      cons: ["完全な履歴ではない"]
    },
    {
      approach: "外部ストレージ併用",
      description: "古いデータはSupabaseやS3に移動",
      pros: ["KVの制限を回避", "無制限の履歴保存"],
      cons: ["追加コスト", "複雑性の増加"]
    }
  ]
}

function main() {
  console.log("=== Vercel KV 日次人気タグバックアップ実現可能性分析 ===")
  console.log()
  
  // 現在の使用状況
  console.log("1. 現在のストレージ使用状況:")
  const current = calculateCurrentUsage()
  console.log(`   - メインランキング: ${current.mainRankingItems.toLocaleString()}アイテム (${(current.mainRankingBytes / (1024 * 1024)).toFixed(1)}MB)`)
  console.log(`   - タグランキング: ${current.tagRankingItems.toLocaleString()}アイテム (${(current.tagRankingBytes / (1024 * 1024)).toFixed(1)}MB)`)
  console.log(`   - 合計: ${current.totalItems.toLocaleString()}アイテム (${current.totalMB.toFixed(1)}MB)`)
  console.log()
  
  // 日次バックアップの要件
  console.log("2. 日次バックアップの要件:")
  const backup = calculateDailyBackupRequirements()
  console.log(`   - 1日あたり: ${backup.tagsPerDay}タグ (${(backup.bytesPerDay / 1024).toFixed(1)}KB)`)
  console.log(`   - 30日分: ${backup.totalBackupEntries}エントリ (${backup.totalBackupMB.toFixed(1)}MB)`)
  console.log(`   - 日次コマンド数: ${backup.commandsPerDay}回`)
  console.log()
  
  // 合計使用量の計算
  console.log("3. 合計ストレージ使用量:")
  const totalMB = current.totalMB + backup.totalBackupMB
  console.log(`   - 現在の使用量: ${current.totalMB.toFixed(1)}MB`)
  console.log(`   - バックアップ追加: ${backup.totalBackupMB.toFixed(1)}MB`)
  console.log(`   - 合計: ${totalMB.toFixed(1)}MB`)
  console.log()
  
  // Vercel制限との比較
  console.log("4. Vercel KV制限との比較:")
  console.log(`   Free tier (256MB):`)
  console.log(`     - ストレージ使用率: ${(totalMB / 256 * 100).toFixed(1)}%`)
  console.log(`     - ${totalMB < 256 ? '✅ 制限内' : '❌ 制限超過'}`)
  console.log(`   Pro tier (1GB):`)
  console.log(`     - ストレージ使用率: ${(totalMB / 1024 * 100).toFixed(1)}%`)
  console.log(`     - ✅ 十分な余裕あり`)
  console.log()
  
  // コマンド数の分析
  const currentDailyCommands = 500 // 推定値（cron + ユーザーアクセス）
  const totalDailyCommands = currentDailyCommands + backup.commandsPerDay
  console.log("5. KVコマンド数の分析:")
  console.log(`   - 現在の日次コマンド数: 約${currentDailyCommands}回`)
  console.log(`   - バックアップ追加: ${backup.commandsPerDay}回`)
  console.log(`   - 合計: ${totalDailyCommands}回`)
  console.log(`   - Free tier (3,000/日): ${totalDailyCommands < 3000 ? '✅ 制限内' : '❌ 制限超過'}`)
  console.log(`   - Pro tier (100,000/日): ✅ 十分な余裕あり`)
  console.log()
  
  // 推奨事項
  console.log("6. 推奨事項:")
  if (totalMB < 200) {
    console.log("   ✅ Free tierでも実装可能")
    console.log("   - 現在のストレージ使用量に余裕があります")
    console.log("   - 日次バックアップを安全に実装できます")
  } else {
    console.log("   ⚠️  Pro tierへのアップグレードを推奨")
    console.log("   - Free tierの制限に近づいています")
    console.log("   - 将来の拡張性を考慮してPro tierを検討してください")
  }
  console.log()
  
  // 代替アプローチ
  console.log("7. 代替アプローチ:")
  const alternatives = analyzeAlternativeApproaches()
  alternatives.forEach((alt, index) => {
    console.log(`   ${index + 1}. ${alt.approach}`)
    console.log(`      説明: ${alt.description}`)
    console.log(`      利点: ${alt.pros.join(", ")}`)
    console.log(`      欠点: ${alt.cons.join(", ")}`)
    console.log()
  })
  
  // 実装案
  console.log("8. 推奨実装案:")
  console.log("   データ構造:")
  console.log("   ```")
  console.log("   キー: popular-tags-backup-{YYYY-MM-DD}")
  console.log("   値: {")
  console.log("     date: '2024-01-01',")
  console.log("     genres: {")
  console.log("       all: ['tag1', 'tag2', ...],")
  console.log("       game: ['tag1', 'tag2', ...],")
  console.log("       ...")
  console.log("     }")
  console.log("   }")
  console.log("   TTL: 31日（自動削除）")
  console.log("   ```")
  console.log()
  console.log("   実装手順:")
  console.log("   1. cron jobに日次バックアップロジックを追加")
  console.log("   2. 各ジャンルの人気タグを収集")
  console.log("   3. 1つのKVエントリとして保存（TTL設定）")
  console.log("   4. 管理画面で履歴を表示")
}

main()