import { describe, it, expect } from 'vitest'
import { ipToInt, intToIp, hostRange, pingArgs } from './arp-sweep'

describe('pingArgs', () => {
    it('uses milliseconds on macOS but whole seconds on Linux', () => {
        expect(pingArgs('10.0.0.1', 'darwin')).toEqual(['-c', '1', '-W', '300', '10.0.0.1'])
        expect(pingArgs('10.0.0.1', 'linux')).toEqual(['-c', '1', '-W', '1', '10.0.0.1'])
        expect(pingArgs('10.0.0.1', 'win32')).toEqual(['-n', '1', '-w', '300', '10.0.0.1'])
    })
})

describe('ipToInt / intToIp', () => {
    it('round-trips addresses, including the high bit', () => {
        for (const ip of ['0.0.0.0', '192.168.0.1', '10.0.0.255', '255.255.255.255']) {
            expect(intToIp(ipToInt(ip))).toBe(ip)
        }
    })

    it('rejects malformed addresses', () => {
        expect(() => ipToInt('192.168.0')).toThrow()
        expect(() => ipToInt('192.168.0.256')).toThrow()
        expect(() => ipToInt('a.b.c.d')).toThrow()
    })
})

describe('hostRange', () => {
    it('excludes the network and broadcast addresses of a /24', () => {
        const range = hostRange('192.168.0.172', '255.255.255.0')
        expect(range).not.toBeNull()
        expect(intToIp(range!.first)).toBe('192.168.0.1')
        expect(intToIp(range!.last)).toBe('192.168.0.254')
    })

    it('handles a /25 without walking into the neighbouring half', () => {
        const range = hostRange('10.0.0.130', '255.255.255.128')
        expect(intToIp(range!.first)).toBe('10.0.0.129')
        expect(intToIp(range!.last)).toBe('10.0.0.254')
    })

    it('refuses subnets too wide to sweep politely', () => {
        expect(hostRange('10.0.0.1', '255.255.0.0')).toBeNull()
        expect(hostRange('10.0.0.1', '255.255.254.0')).toBeNull()
    })

    it('refuses a /31 and /32 that have no usable hosts', () => {
        expect(hostRange('10.0.0.1', '255.255.255.254')).toBeNull()
        expect(hostRange('10.0.0.1', '255.255.255.255')).toBeNull()
    })
})
