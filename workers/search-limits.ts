export type SearchLimits = { perMinute: number; perDay: number }
export function validSearchLimits(value: unknown): value is SearchLimits {
  const limits = value as SearchLimits | null
  return (
    !!limits &&
    Number.isInteger(limits.perMinute) &&
    limits.perMinute >= 1 &&
    limits.perMinute <= 600 &&
    Number.isInteger(limits.perDay) &&
    limits.perDay >= 1 &&
    limits.perDay <= 1_000_000
  )
}
