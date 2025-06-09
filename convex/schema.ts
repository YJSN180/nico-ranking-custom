import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ランキングのスナップショット（履歴用）
  rankingSnapshots: defineTable({
    timestamp: v.string(), // ISO 8601形式
    genre: v.string(),
    period: v.string(), // "24h" | "hour"
    items: v.array(
      v.object({
        rank: v.number(),
        id: v.string(),
        title: v.string(),
        thumbURL: v.string(),
        views: v.number(),
        comments: v.optional(v.number()),
        mylists: v.optional(v.number()),
        likes: v.optional(v.number()),
        tags: v.optional(v.array(v.string())),
        authorId: v.optional(v.string()),
        authorName: v.optional(v.string()),
        authorIcon: v.optional(v.string()),
        registeredAt: v.optional(v.string()),
      })
    ),
    popularTags: v.array(v.string()),
  })
    .index("by_genre_period", ["genre", "period"])
    .index("by_timestamp", ["timestamp"]),

  // タグ別ランキングのキャッシュ
  tagRankingCache: defineTable({
    genre: v.string(),
    period: v.string(),
    tag: v.string(),
    items: v.array(
      v.object({
        rank: v.number(),
        id: v.string(),
        title: v.string(),
        thumbURL: v.string(),
        views: v.number(),
        comments: v.optional(v.number()),
        mylists: v.optional(v.number()),
        likes: v.optional(v.number()),
        tags: v.optional(v.array(v.string())),
        authorId: v.optional(v.string()),
        authorName: v.optional(v.string()),
        authorIcon: v.optional(v.string()),
        registeredAt: v.optional(v.string()),
      })
    ),
    updatedAt: v.string(),
    expiresAt: v.string(), // 有効期限（1時間後）
  })
    .index("by_genre_period_tag", ["genre", "period", "tag"])
    .index("by_expires", ["expiresAt"]),

  // NGリスト設定
  ngLists: defineTable({
    userId: v.string(),
    videoIds: v.array(v.string()),
    userIds: v.array(v.string()),
    keywords: v.array(v.string()),
    updatedAt: v.string(),
  }).index("by_userId", ["userId"]),
});