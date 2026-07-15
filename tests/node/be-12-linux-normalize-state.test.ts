import { describe, it, expect } from 'vitest'
import { normalizeState } from '@main/utils/parsers/linux-parser'

describe('BE-12 Linux normalizeState handles dashed states', () => {
    it('normalizes a dashed token that is not pre-enumerated in the map', () => {
        expect(normalizeState('SYN-SENT')).toBe('SYN_SENT')
        expect(normalizeState('FIN-WAIT-1')).toBe('FIN_WAIT1')
    })

    it('normalizes ss aliases', () => {
        expect(normalizeState('ESTAB')).toBe('ESTABLISHED')
        expect(normalizeState('UNCONN')).toBe('CLOSED')
    })

    it('maps bare CLOSE without falling through to ESTABLISHED', () => {
        expect(normalizeState('CLOSE')).toBe('CLOSED')
    })
})
