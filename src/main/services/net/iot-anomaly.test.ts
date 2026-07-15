import { describe, it, expect } from 'vitest'
import { detectNewCountryAnomaly } from './iot-anomaly'

describe('detectNewCountryAnomaly', () => {
    it('seeds without an anomaly when the baseline is empty', () => {
        const result = detectNewCountryAnomaly(new Set(), ['US', 'DE'])
        expect(result.isAnomaly).toBe(false)
        expect(result.newCountries).toEqual([])
    })

    it('reports no anomaly when all current countries are known', () => {
        const baseline = new Set(['US', 'DE'])
        const result = detectNewCountryAnomaly(baseline, ['US', 'DE'])
        expect(result.isAnomaly).toBe(false)
        expect(result.newCountries).toEqual([])
    })

    it('flags a genuinely new country and lists it', () => {
        const baseline = new Set(['US'])
        const result = detectNewCountryAnomaly(baseline, ['US', 'RU'])
        expect(result.isAnomaly).toBe(true)
        expect(result.newCountries).toEqual(['RU'])
    })

    it('does not mutate the baseline', () => {
        const baseline = new Set(['US'])
        detectNewCountryAnomaly(baseline, ['US', 'RU'])
        expect(Array.from(baseline)).toEqual(['US'])
    })

    it('deduplicates new countries', () => {
        const baseline = new Set(['US'])
        const result = detectNewCountryAnomaly(baseline, ['RU', 'RU', 'CN'])
        expect(result.newCountries).toEqual(['RU', 'CN'])
    })
})
