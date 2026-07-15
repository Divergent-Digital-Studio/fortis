import { describe, it, expect } from 'vitest'
import {
    ipv4ToUint,
    ipv6ToPrefix,
    isPrivateOrReservedIp,
    isPrivateOrReservedIpv4,
    isPrivateOrReservedIpv6,
} from './ip-uint'

describe('ipv4ToUint', () => {
    it('converts dotted quad to uint32', () => {
        expect(ipv4ToUint('1.2.3.4')).toBe(16909060)
        expect(ipv4ToUint('0.0.0.0')).toBe(0)
        expect(ipv4ToUint('255.255.255.255')).toBe(4294967295)
    })

    it('returns null for non-IPv4 / malformed input', () => {
        expect(ipv4ToUint('::1')).toBeNull()
        expect(ipv4ToUint('1.2.3')).toBeNull()
        expect(ipv4ToUint('1.2.3.256')).toBeNull()
        expect(ipv4ToUint('1.2.3.4.5')).toBeNull()
        expect(ipv4ToUint('a.b.c.d')).toBeNull()
    })
})

describe('isPrivateOrReservedIpv4', () => {
    it('flags RFC1918 and reserved ranges', () => {
        expect(isPrivateOrReservedIpv4('10.0.0.1')).toBe(true)
        expect(isPrivateOrReservedIpv4('192.168.1.5')).toBe(true)
        expect(isPrivateOrReservedIpv4('172.16.0.9')).toBe(true)
        expect(isPrivateOrReservedIpv4('127.0.0.1')).toBe(true)
        expect(isPrivateOrReservedIpv4('169.254.10.10')).toBe(true)
        expect(isPrivateOrReservedIpv4('224.0.0.1')).toBe(true)
    })

    it('treats malformed / non-IPv4 as reserved (do not geolocate)', () => {
        expect(isPrivateOrReservedIpv4('::1')).toBe(true)
        expect(isPrivateOrReservedIpv4('not-an-ip')).toBe(true)
    })

    it('passes public addresses', () => {
        expect(isPrivateOrReservedIpv4('8.8.8.8')).toBe(false)
        expect(isPrivateOrReservedIpv4('93.184.216.34')).toBe(false)
        expect(isPrivateOrReservedIpv4('1.1.1.1')).toBe(false)
    })
})

describe('ipv6ToPrefix', () => {
    const hex = (value: bigint | null): string | null =>
        value === null ? null : value.toString(16)

    it('keeps only the top 64 bits', () => {
        expect(hex(ipv6ToPrefix('2001:4860:4802:0032:0000:0000:0000:0015'))).toBe(
            '2001486048020032',
        )
    })

    it('ignores the interface identifier', () => {
        expect(ipv6ToPrefix('2606:4700:20::681a:1')).toBe(
            ipv6ToPrefix('2606:4700:20::dead:beef'),
        )
    })

    it('expands :: in the middle, at the start, and at the end', () => {
        expect(hex(ipv6ToPrefix('2606:4700:20::68'))).toBe('2606470000200000')
        expect(hex(ipv6ToPrefix('::1'))).toBe('0')
        expect(hex(ipv6ToPrefix('2000::'))).toBe('2000000000000000')
    })

    it('strips a zone identifier', () => {
        expect(ipv6ToPrefix('fe80::1%en0')).toBe(ipv6ToPrefix('fe80::1'))
    })

    it('rejects malformed input', () => {
        expect(ipv6ToPrefix('')).toBeNull()
        expect(ipv6ToPrefix('1.2.3.4')).toBeNull()
        expect(ipv6ToPrefix('2001::1::2')).toBeNull()
        expect(ipv6ToPrefix('2001:4860:4802')).toBeNull()
        expect(ipv6ToPrefix('gggg::1')).toBeNull()
    })

    it('rejects :: that would expand to no groups', () => {
        expect(ipv6ToPrefix('1:2:3:4:5:6:7::8')).toBeNull()
    })
})

describe('isPrivateOrReservedIpv6', () => {
    it('flags loopback, unspecified, link-local, ULA, multicast, doc', () => {
        expect(isPrivateOrReservedIpv6('::1')).toBe(true)
        expect(isPrivateOrReservedIpv6('::')).toBe(true)
        expect(isPrivateOrReservedIpv6('fe80::1cd7:3adf:2a2:a36d')).toBe(true)
        expect(isPrivateOrReservedIpv6('fd00::1')).toBe(true)
        expect(isPrivateOrReservedIpv6('ff02::1')).toBe(true)
        expect(isPrivateOrReservedIpv6('2001:db8::1')).toBe(true)
    })

    it('allows real public addresses', () => {
        expect(isPrivateOrReservedIpv6('2001:4860:4802:32::15')).toBe(false)
        expect(isPrivateOrReservedIpv6('2606:4700:20::681a:1')).toBe(false)
        expect(isPrivateOrReservedIpv6('2a02:6b8::1:119')).toBe(false)
    })
})

describe('isPrivateOrReservedIp', () => {
    it('routes by family', () => {
        expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false)
        expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true)
        expect(isPrivateOrReservedIp('2606:4700:20::68')).toBe(false)
        expect(isPrivateOrReservedIp('fe80::1')).toBe(true)
    })

    it('treats an IPv4-mapped address as its IPv4 self', () => {
        expect(isPrivateOrReservedIp('::ffff:192.168.1.1')).toBe(true)
        expect(isPrivateOrReservedIp('::ffff:8.8.8.8')).toBe(false)
    })

    it('rejects garbage as reserved rather than geolocating it', () => {
        expect(isPrivateOrReservedIp('not-an-ip')).toBe(true)
    })
})
