import { describe, it, expect } from 'vitest'
import { computeReportRetentionCutoff } from './retention'

describe('report retention cutoff', () => {
    it('returns null for unlimited tier', () => {
        expect(computeReportRetentionCutoff({ alertHistoryHours: null }, 1_000_000)).toBeNull()
    })

    it('returns now - history window for free tier', () => {
        const now = 100_000_000
        expect(computeReportRetentionCutoff({ alertHistoryHours: 24 }, now)).toBe(now - 24 * 60 * 60 * 1000)
    })
})
