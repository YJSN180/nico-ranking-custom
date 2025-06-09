import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// 10分間隔でランキングを更新
crons.interval(
  "update all rankings",
  { minutes: 10 },
  api.updateRanking.updateAllRankings
);

export default crons;