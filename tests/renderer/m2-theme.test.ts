import { describe, it, expect } from 'vitest'
import { resolveTheme } from '@renderer/styles/theme'

describe('resolveTheme', () => {
    it('passes through explicit themes', () => {
        expect(resolveTheme('dark', true)).toBe('dark')
        expect(resolveTheme('light', false)).toBe('light')
    })

    it('resolves system by OS preference', () => {
        expect(resolveTheme('system', true)).toBe('light')
        expect(resolveTheme('system', false)).toBe('dark')
    })

    it('falls back to dark for unknown', () => {
        // @ts-expect-error testing runtime guard
        expect(resolveTheme('weird', false)).toBe('dark')
    })
})
