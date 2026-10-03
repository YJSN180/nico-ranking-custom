import { DurableObject } from 'cloudflare:workers'

import { validSearchLimits, type SearchLimits } from './search-limits'

/** One coordination atom: this deployment's search admission budget, never ranking traffic. */
export class SearchBudget extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY CHECK(id = 1), minute INTEGER NOT NULL, day INTEGER NOT NULL,
      minute_count INTEGER NOT NULL, day_count INTEGER NOT NULL
    )`)
  }

  take(limits: SearchLimits): { allowed: boolean; retryAfter: number } {
    if (!validSearchLimits(limits)) throw new Error('Invalid search limits')
    const seconds = Math.floor(Date.now() / 1000)
    const minute = Math.floor(seconds / 60)
    const day = Math.floor(seconds / 86400)
    return this.ctx.storage.transactionSync(() => {
      const rows = this.ctx.storage.sql
        .exec<{
          minute: number
          day: number
          minute_count: number
          day_count: number
        }>('SELECT minute, day, minute_count, day_count FROM budget WHERE id = 1')
        .toArray()
      const previous = rows[0]
      const minuteCount =
        previous?.minute === minute ? previous.minute_count : 0
      const dayCount = previous?.day === day ? previous.day_count : 0
      if (dayCount >= limits.perDay)
        return { allowed: false, retryAfter: (day + 1) * 86400 - seconds }
      if (minuteCount >= limits.perMinute)
        return { allowed: false, retryAfter: (minute + 1) * 60 - seconds }
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO budget VALUES (1, ?, ?, ?, ?)',
        minute,
        day,
        minuteCount + 1,
        dayCount + 1,
      )
      return { allowed: true, retryAfter: 0 }
    })
  }
}
