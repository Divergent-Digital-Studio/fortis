import { describe, it, expect } from 'vitest'
import { anonymizeIPAddress, isPrivateIP, initializeSalt, getSalt } from '@main/utils/anonymizer'

describe('BE-26 #7 anonymizer salt persistence', () => {
    it('same private IP hashes identically across a simulated restart', () => {
        initializeSalt('fixed-persisted-salt-value')
        const first = anonymizeIPAddress('192.168.1.5')

        initializeSalt('fixed-persisted-salt-value')
        const second = anonymizeIPAddress('192.168.1.5')

        expect(first).toBe(second)
        expect(first.startsWith('hashed:')).toBe(true)
    })

    it('initializeSalt persists the provided salt', () => {
        initializeSalt('another-fixed-salt')
        expect(getSalt()).toBe('another-fixed-salt')
    })
})

describe('BE-26 #7 IPv4-mapped IPv6 normalization', () => {
    it('::ffff:192.168.1.5 is treated as private and hashed', () => {
        initializeSalt('salt-for-mapped')
        const result = anonymizeIPAddress('::ffff:192.168.1.5')
        expect(result.startsWith('hashed:')).toBe(true)
    })

    it('isPrivateIP recognizes IPv4-mapped private addresses', () => {
        expect(isPrivateIP('::ffff:10.0.0.1')).toBe(true)
        expect(isPrivateIP('::ffff:192.168.0.1')).toBe(true)
    })

    it('::ffff:<public> stays in clear', () => {
        const result = anonymizeIPAddress('::ffff:93.184.216.34')
        expect(result).toBe('::ffff:93.184.216.34')
    })
})
