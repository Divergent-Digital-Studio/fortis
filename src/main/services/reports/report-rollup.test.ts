import { describe, it, expect } from 'vitest'
import { buildRollup } from './report-rollup'

const conns = [
    { processName: 'chrome', remoteAddress: '1.1.1.1' },
    { processName: 'chrome', remoteAddress: '1.1.1.1' },
    { processName: 'node', remoteAddress: '8.8.8.8' },
]

describe('buildRollup', () => {
    it('aggregates top processes and destinations by count', () => {
        const r = buildRollup({
            connections: conns,
            threatCount: 2,
            newDeviceCount: 1,
            healthScore: 73,
            countryOf: () => null,
        })
        expect(r.topProcesses[0]).toEqual({ name: 'chrome', count: 2 })
        expect(r.topDestinations[0]).toEqual({ address: '1.1.1.1', country: null, count: 2 })
        expect(r.threatCount).toBe(2)
        expect(r.newDeviceCount).toBe(1)
        expect(r.healthScore).toBe(73)
    })

    it('attaches country via the injected lookup', () => {
        const r = buildRollup({
            connections: conns,
            threatCount: 0,
            newDeviceCount: 0,
            healthScore: null,
            countryOf: (addr) => (addr === '8.8.8.8' ? 'US' : null),
        })
        const google = r.topDestinations.find((d) => d.address === '8.8.8.8')
        expect(google?.country).toBe('US')
    })

    it('handles empty input', () => {
        const r = buildRollup({ connections: [], threatCount: 0, newDeviceCount: 0, healthScore: null, countryOf: () => null })
        expect(r.topProcesses).toEqual([])
        expect(r.topDestinations).toEqual([])
    })
})
