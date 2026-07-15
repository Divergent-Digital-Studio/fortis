import { describe, it, expect } from 'vitest'
import {
    lookupLocation,
    EMPTY_GEO_DATABASE,
    type GeoDatabase,
    type GeoLocation,
} from './geoip-lookup'

const locations: GeoLocation[] = [
    { lat: 0, lon: 0, countryCode: 'ZZ', city: '' },
    { lat: 38, lon: -97, countryCode: 'US', city: 'Wichita' },
    { lat: -37.8, lon: 145, countryCode: 'AU', city: 'Melbourne' },
    { lat: 51, lon: 10, countryCode: 'DE', city: 'Frankfurt' },
]

const prefix = (head: string): bigint => BigInt(`0x${head}`)

/*
 * Gapless in both families: range i covers [starts[i], starts[i+1]-1], the last runs
 * to the top of its key space. Location 0 is the reserved sentinel.
 */
const db: GeoDatabase = {
    // 0.0.0.0 reserved | 1.0.0.0 US | 2.0.0.0 AU
    v4Starts: new Uint32Array([0, 16777216, 33554432]),
    v4LocIndex: new Uint32Array([0, 1, 2]),
    // ::/0 reserved | 2000:: US | 2606:4700:: AU | 2a02:: DE
    v6Starts: new BigUint64Array([
        0n,
        prefix('2000000000000000'),
        prefix('2606470000000000'),
        prefix('2a02000000000000'),
    ]),
    v6LocIndex: new Uint32Array([0, 1, 2, 3]),
    locations,
}

describe('lookupLocation (IPv4)', () => {
    it('finds the range containing the address', () => {
        expect(lookupLocation(db, '1.2.3.4')?.city).toBe('Wichita')
        expect(lookupLocation(db, '2.2.2.2')?.city).toBe('Melbourne')
    })

    it('treats a range start as inside that range', () => {
        expect(lookupLocation(db, '1.0.0.0')?.countryCode).toBe('US')
        expect(lookupLocation(db, '2.0.0.0')?.countryCode).toBe('AU')
    })

    it('treats the address before the next start as the previous range', () => {
        expect(lookupLocation(db, '1.255.255.255')?.countryCode).toBe('US')
    })

    it('extends the final range to the top of the address space', () => {
        expect(lookupLocation(db, '255.255.255.255')?.countryCode).toBe('AU')
    })

    it('returns null inside the reserved sentinel range', () => {
        expect(lookupLocation(db, '0.0.0.1')).toBeNull()
    })
})

describe('lookupLocation (IPv6)', () => {
    it('finds the range containing the address', () => {
        expect(lookupLocation(db, '2606:4700:20::681a:1')?.city).toBe('Melbourne')
        expect(lookupLocation(db, '2a02:6b8::1:119')?.city).toBe('Frankfurt')
        expect(lookupLocation(db, '2001:4860:4802:32::15')?.city).toBe('Wichita')
    })

    it('ignores the interface identifier', () => {
        const a = lookupLocation(db, '2606:4700:20::1')
        const b = lookupLocation(db, '2606:4700:20::dead:beef')
        expect(a).toBe(b)
    })

    it('returns null inside the reserved sentinel range', () => {
        expect(lookupLocation(db, '::1')).toBeNull()
        expect(lookupLocation(db, '1000::1')).toBeNull()
    })

    it('returns null for a malformed address', () => {
        expect(lookupLocation(db, '2001::1::2')).toBeNull()
        expect(lookupLocation(db, 'gggg::1')).toBeNull()
    })

    it('routes an IPv4-mapped address to the IPv4 table', () => {
        expect(lookupLocation(db, '::ffff:1.2.3.4')?.city).toBe('Wichita')
    })
})

describe('lookupLocation (degenerate)', () => {
    it('returns null for an empty database', () => {
        expect(lookupLocation(EMPTY_GEO_DATABASE, '1.2.3.4')).toBeNull()
        expect(lookupLocation(EMPTY_GEO_DATABASE, '2606:4700::1')).toBeNull()
    })

    it('returns null when the address falls below the first range', () => {
        const offset: GeoDatabase = {
            ...db,
            v4Starts: new Uint32Array([500]),
            v4LocIndex: new Uint32Array([1]),
        }
        expect(lookupLocation(offset, '0.0.0.1')).toBeNull()
    })

    it('returns null for a location index past the table', () => {
        const bad: GeoDatabase = {
            ...db,
            v4Starts: new Uint32Array([0]),
            v4LocIndex: new Uint32Array([99]),
        }
        expect(lookupLocation(bad, '1.2.3.4')).toBeNull()
    })
})
