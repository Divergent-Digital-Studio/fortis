import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'

describe('test harness (node project)', () => {
    it('resolves the @shared alias and loads shared types', () => {
        expect(DEFAULT_SETTINGS).toBeDefined()
        expect(typeof DEFAULT_SETTINGS).toBe('object')
    })
})
