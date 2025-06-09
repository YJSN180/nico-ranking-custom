import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 10分ごとにランキングデータを更新
crons.interval(
  "update_rankings",
  { minutes: 10 },
  internal.ranking.updateAllRankings
);

// 1時間ごとに期限切れのタグランキングキャッシュをクリーンアップ
crons.interval(
  "cleanup_tag_cache",
  { hours: 1 },
  internal.ranking.cleanupExpiredTagCache
);

export default crons;