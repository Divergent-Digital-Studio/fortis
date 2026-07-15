import { describe, it, expect } from 'vitest'
import { scoreBehavior, type BehaviorWindow, type Baseline } from './insider-threat'

const baseline: Baseline = {
    knownDestinations: new Set(['1.1.1.1', '2.2.2.2']),
    typicalHourStart: 9,
    typicalHourEnd: 18,
    avgBytesPerWindow: 1000,
}

describe('insider-threat', () => {
    it('scores low when behavior matches the baseline', () => {
        const w: BehaviorWindow = { processName: 'curl', destinations: ['1.1.1.1'], hour: 12, bytes: 1100 }
        const r = scoreBehavior(baseline, w)
        expect(r.score).toBeLessThan(30)
    })
    it('scores high for many new destinations off-hours with an egress spike', () => {
        const w: BehaviorWindow = { processName: 'curl', destinations: ['9.9.9.9', '8.8.8.8', '7.7.7.7'], hour: 3, bytes: 50000 }
        const r = scoreBehavior(baseline, w)
        expect(r.score).toBeGreaterThan(60)
        expect(r.factors.length).toBeGreaterThan(0)
    })
    it('caps the score at 100', () => {
        const w: BehaviorWindow = { processName: 'x', destinations: Array.from({ length: 50 }, (_, i) => `d${i}`), hour: 2, bytes: 9_999_999 }
        expect(scoreBehavior(baseline, w).score).toBeLessThanOrEqual(100)
    })
})
