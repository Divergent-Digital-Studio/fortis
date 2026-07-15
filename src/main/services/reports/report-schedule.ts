export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS

export const DEFAULT_PERIOD_DAYS = 7
const MIN_PERIOD_DAYS = 1
const MAX_PERIOD_DAYS = 365

export function clampPeriodDays(days: unknown): number {
    const n = typeof days === 'number' && Number.isFinite(days) ? Math.floor(days) : DEFAULT_PERIOD_DAYS
    return Math.min(MAX_PERIOD_DAYS, Math.max(MIN_PERIOD_DAYS, n))
}

export function shouldGenerateReport(lastGeneratedAt: number | null, now: number): boolean {
    if (lastGeneratedAt === null) return true
    return now - lastGeneratedAt >= WEEK_MS
}
