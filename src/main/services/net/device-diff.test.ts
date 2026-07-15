import { describe, it, expect } from 'vitest'
import { diffDevices } from './device-diff'

describe('diffDevices', () => {
    it('splits new vs known by normalized mac', () => {
        const previous = new Set(['00:11:22:aa:bb:cc'])
        const current = [
            { ip: '192.168.1.1', mac: '00-11-22-AA-BB-CC' },
            { ip: '192.168.1.2', mac: 'de:ad:be:ef:00:01' },
        ]
        const { newDevices, knownDevices } = diffDevices(previous, current)
        expect(knownDevices.map((d) => d.ip)).toEqual(['192.168.1.1'])
        expect(newDevices.map((d) => d.ip)).toEqual(['192.168.1.2'])
    })

    it('treats everything as new when there is no history', () => {
        const current = [{ ip: '192.168.1.5', mac: 'aa:bb:cc:dd:ee:ff' }]
        const { newDevices, knownDevices } = diffDevices(new Set(), current)
        expect(newDevices).toHaveLength(1)
        expect(knownDevices).toHaveLength(0)
    })
})
