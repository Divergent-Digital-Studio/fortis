import { describe, it, expect } from 'vitest'
import { resolveRetentionHours, retentionMsForTier, retentionCutoff } from '@main/services/db/retention'

const HOUR_MS = 60 * 60 * 1000

describe('DB-02 tier-aware retention window', () => {
    it('free tier keeps 24h', () => {
        expect(resolveRetentionHours('free')).toBe(24)
        expect(retentionMsForTier('free')).toBe(24 * HOUR_MS)
    })

    it('pro tier keeps 30 days', () => {
        expect(resolveRetentionHours('pro')).toBe(30 * 24)
        expect(retentionMsForTier('pro')).toBe(30 * 24 * HOUR_MS)
    })

    it('enterprise tier keeps 30 days', () => {
        expect(resolveRetentionHours('enterprise')).toBe(30 * 24)
    })

    it('unknown tier falls back to free (24h)', () => {
        expect(resolveRetentionHours('shield')).toBe(24)
        expect(resolveRetentionHours(undefined)).toBe(24)
    })

    it('cutoff is now minus the tier window', () => {
        const now = 1_000_000_000_000
        expect(retentionCutoff('free', now)).toBe(now - 24 * HOUR_MS)
        expect(retentionCutoff('pro', now)).toBe(now - 30 * 24 * HOUR_MS)
    })

    it('pro window is strictly longer than free so paid users keep more history', () => {
        expect(retentionMsForTier('pro')).toBeGreaterThan(retentionMsForTier('free'))
    })
})
