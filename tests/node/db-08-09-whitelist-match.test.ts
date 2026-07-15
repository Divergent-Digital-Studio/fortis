import { describe, it, expect } from 'vitest'
import { whitelistEntryMatches, isWhitelistedBy, matchesCidr } from '@main/services/db/whitelist-match'

describe('DB-08 narrow entries do not over-match', () => {
    it('a row pinned to BOTH process and address does NOT match a process-only query', () => {
        const entry = { processName: 'curl', remoteAddress: '1.2.3.4' }
        expect(whitelistEntryMatches(entry, { processName: 'curl' })).toBe(false)
    })

    it('a row pinned to BOTH process and address matches when both are supplied and equal', () => {
        const entry = { processName: 'curl', remoteAddress: '1.2.3.4' }
        expect(whitelistEntryMatches(entry, { processName: 'curl', remoteAddress: '1.2.3.4' })).toBe(true)
    })

    it('a process-only row matches a process-only query (genuine narrow wildcard)', () => {
        const entry = { processName: 'curl' }
        expect(whitelistEntryMatches(entry, { processName: 'curl' })).toBe(true)
    })

    it('an empty entry never matches', () => {
        expect(whitelistEntryMatches({}, { processName: 'curl' })).toBe(false)
    })

    it('a port-pinned row rejects a different port', () => {
        const entry = { processName: 'curl', remotePort: 443 }
        expect(whitelistEntryMatches(entry, { processName: 'curl', remotePort: 8080 })).toBe(false)
    })
})

describe('DB-09 CIDR / subnet matching', () => {
    it('matches an in-range IPv4 address', () => {
        expect(matchesCidr('10.0.0.5', '10.0.0.0/24')).toBe(true)
    })

    it('rejects an out-of-range IPv4 address', () => {
        expect(matchesCidr('10.0.1.5', '10.0.0.0/24')).toBe(false)
    })

    it('a /32 matches only itself', () => {
        expect(matchesCidr('10.0.0.5', '10.0.0.5/32')).toBe(true)
        expect(matchesCidr('10.0.0.6', '10.0.0.5/32')).toBe(false)
    })

    it('a /0 matches anything', () => {
        expect(matchesCidr('203.0.113.9', '0.0.0.0/0')).toBe(true)
    })

    it('malformed CIDR returns false without throwing', () => {
        expect(() => matchesCidr('10.0.0.5', '10.0.0.0/99')).not.toThrow()
        expect(matchesCidr('10.0.0.5', '10.0.0.0/99')).toBe(false)
        expect(matchesCidr('10.0.0.5', 'not-an-ip/24')).toBe(false)
        expect(matchesCidr('bad', '10.0.0.0/24')).toBe(false)
    })

    it('an entry with a CIDR remoteAddress matches in-range queries', () => {
        const entry = { remoteAddress: '192.168.1.0/24' }
        expect(whitelistEntryMatches(entry, { remoteAddress: '192.168.1.77' })).toBe(true)
        expect(whitelistEntryMatches(entry, { remoteAddress: '192.168.2.1' })).toBe(false)
    })
})

describe('DB-09 case-insensitive process matching', () => {
    it('matches process names case-insensitively', () => {
        const entry = { processName: 'Chrome' }
        expect(whitelistEntryMatches(entry, { processName: 'chrome' })).toBe(true)
        expect(whitelistEntryMatches(entry, { processName: 'CHROME' })).toBe(true)
    })

    it('exact non-CIDR address still matches only itself', () => {
        const entry = { remoteAddress: '1.1.1.1' }
        expect(whitelistEntryMatches(entry, { remoteAddress: '1.1.1.1' })).toBe(true)
        expect(whitelistEntryMatches(entry, { remoteAddress: '1.1.1.2' })).toBe(false)
    })
})

describe('isWhitelistedBy aggregate', () => {
    it('returns false for an all-undefined query', () => {
        expect(isWhitelistedBy([{ processName: 'curl' }], {})).toBe(false)
    })

    it('returns true if any entry matches', () => {
        const entries = [{ processName: 'ssh' }, { remoteAddress: '10.0.0.0/8' }]
        expect(isWhitelistedBy(entries, { remoteAddress: '10.9.9.9' })).toBe(true)
    })
})
