import { describe, it, expect } from 'vitest'
import { shouldGenerateReport, clampPeriodDays, WEEK_MS, DEFAULT_PERIOD_DAYS } from './report-schedule'

describe('shouldGenerateReport', () => {
    it('generates when no prior report', () => {
        expect(shouldGenerateReport(null, 1_000_000)).toBe(true)
    })

    it('generates when a week has elapsed', () => {
        expect(shouldGenerateReport(0, WEEK_MS)).toBe(true)
        expect(shouldGenerateReport(0, WEEK_MS - 1)).toBe(false)
    })
})

describe('clampPeriodDays', () => {
    it('passes through valid day counts', () => {
        expect(clampPeriodDays(7)).toBe(7)
        expect(clampPeriodDays(30)).toBe(30)
        expect(clampPeriodDays(90)).toBe(90)
    })

    it('clamps to the supported range', () => {
        expect(clampPeriodDays(0)).toBe(1)
        expect(clampPeriodDays(-5)).toBe(1)
        expect(clampPeriodDays(10_000)).toBe(365)
    })

    it('floors fractional days', () => {
        expect(clampPeriodDays(7.9)).toBe(7)
    })

    it('falls back to the default for non-numeric input', () => {
        expect(clampPeriodDays(undefined)).toBe(DEFAULT_PERIOD_DAYS)
        expect(clampPeriodDays('30')).toBe(DEFAULT_PERIOD_DAYS)
        expect(clampPeriodDays(NaN)).toBe(DEFAULT_PERIOD_DAYS)
        expect(clampPeriodDays(Infinity)).toBe(DEFAULT_PERIOD_DAYS)
    })
})
