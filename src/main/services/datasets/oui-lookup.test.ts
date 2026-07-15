import { describe, it, expect } from 'vitest'
import { lookupVendor, normalizeMac, type OuiMap } from './oui-lookup'

const map: OuiMap = { '001122': 'Acme Networks', A4B1C2: 'Nest Labs' }

describe('lookupVendor', () => {
    it('normalizes MAC and looks up the 3-byte prefix', () => {
        expect(lookupVendor(map, 'a4:b1:c2:11:22:33')).toBe('Nest Labs')
        expect(lookupVendor(map, '00-11-22-44-55-66')).toBe('Acme Networks')
        expect(lookupVendor(map, '0011.2244.5566')).toBe('Acme Networks')
    })

    it('returns null for unknown prefixes', () => {
        expect(lookupVendor(map, 'ff:ff:ff:00:00:00')).toBeNull()
    })

    it('returns null for malformed MACs', () => {
        expect(lookupVendor(map, 'not-a-mac')).toBeNull()
        expect(lookupVendor(map, '00:11')).toBeNull()
    })
})

describe('normalizeMac', () => {
    it('returns 12-hex uppercase for valid MACs', () => {
        expect(normalizeMac('a4:b1:c2:11:22:33')).toBe('A4B1C211 2233'.replace(' ', ''))
        expect(normalizeMac('A4-B1-C2-11-22-33')).toBe('A4B1C2112233')
    })

    it('returns null for short / malformed MACs', () => {
        expect(normalizeMac('00:11:22')).toBeNull()
        expect(normalizeMac('garbage')).toBeNull()
    })
})
