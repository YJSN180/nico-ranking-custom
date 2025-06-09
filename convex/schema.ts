import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Cron job status tracking
  cronJobs: defineTable({
    name: v.string(),
    lastRun: v.number(),
    status: v.union(v.literal("success"), v.literal("error"), v.literal("running")),
    error: v.optional(v.string()),
    metadata: v.optional(v.object({
      genresUpdated: v.optional(v.number()),
      totalItems: v.optional(v.number()),
      kvWriteSize: v.optional(v.number()),
      duration: v.optional(v.number()),
    })),
  })
    .index("by_name", ["name"]),

  // Health check for monitoring
  healthCheck: defineTable({
    service: v.string(),
    status: v.string(),
    lastCheck: v.number(),
    details: v.optional(v.any()),
  })
    .index("by_service", ["service"]),
});