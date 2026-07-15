import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENTRY_PATH = resolve(__dirname, '../../src/main/utils/parsers/parser-worker-entry.ts')

describe('BE-08 parser-worker-entry uses the platform factory, not a hardcoded MacParser', () => {
    it('does not instantiate MacParser directly', () => {
        const source = readFileSync(ENTRY_PATH, 'utf8')
        expect(source).not.toMatch(/new MacParser\(/)
    })

    it('routes through PlatformParserFactory.parseWithFallback', () => {
        const source = readFileSync(ENTRY_PATH, 'utf8')
        expect(source).toMatch(/PlatformParserFactory/)
        expect(source).toMatch(/parseWithFallback/)
    })
})
