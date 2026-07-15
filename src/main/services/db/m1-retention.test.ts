import { describe, it, expect } from 'vitest'
import { computeM1RetentionCutoff } from './retention'

describe('computeM1RetentionCutoff', () => {
    it('returns null for unlimited tier so pruning is skipped', () => {
        expect(computeM1RetentionCutoff({ alertHistoryHours: null }, 1_000_000)).toBeNull()
    })

    it('returns now minus the retention window for a bounded tier', () => {
        const now = 100_000_000
        expect(computeM1RetentionCutoff({ alertHistoryHours: 24 }, now)).toBe(now - 24 * 60 * 60 * 1000)
    })

    it('handles a non-24 retention window', () => {
        const now = 50_000_000
        expect(computeM1RetentionCutoff({ alertHistoryHours: 6 }, now)).toBe(now - 6 * 60 * 60 * 1000)
    })
})
