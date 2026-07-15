import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A missing key renders as the raw key string ("iot.destinations.other") in the
 * UI. Nothing else catches it: typecheck ignores JSON contents, and a component
 * test only exercises the locale it renders in.
 */

const LOCALES_DIR = join(process.cwd(), 'src/renderer/i18n/locales')
const SRC_DIR = join(process.cwd(), 'src/renderer')

// Mirrors ENABLED_LOCALES in src/renderer/i18n/index.ts.
const ENABLED = ['en', 'es', 'fr', 'de', 'fa', 'ar'] as const

function load(locale: string): Record<string, string> {
    return JSON.parse(readFileSync(join(LOCALES_DIR, `${locale}.json`), 'utf8')) as Record<string, string>
}

function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) return walk(full)
        return /\.tsx?$/.test(entry.name) ? [full] : []
    })
}

const sources = walk(SRC_DIR).map((f) => readFileSync(f, 'utf8'))
const allSource = sources.join('\n')

describe('i18n locale parity', () => {
    const en = load('en')

    it.each(ENABLED.filter((l) => l !== 'en'))('%s defines every key that en defines', (locale) => {
        const target = load(locale)
        const missing = Object.keys(en).filter((key) => !(key in target))
        expect(missing).toEqual([])
    })

    it.each(ENABLED.filter((l) => l !== 'en'))('%s defines no key that en lacks', (locale) => {
        const target = load(locale)
        const extra = Object.keys(target).filter((key) => !(key in en))
        expect(extra).toEqual([])
    })

    it('every tn() key has both .one and .other forms in each enabled locale', () => {
        // tn('iot.destinations', n) -> looks up `${key}.one` / `${key}.other`
        const keys = new Set<string>()
        for (const match of allSource.matchAll(/\btn\(\s*['"]([^'"]+)['"]/g)) {
            const key = match[1]
            if (key !== undefined) keys.add(key)
        }
        expect(keys.size).toBeGreaterThan(0)

        const missing: string[] = []
        for (const locale of ENABLED) {
            const catalog = load(locale)
            for (const key of keys) {
                for (const form of ['one', 'other']) {
                    if (!(`${key}.${form}` in catalog)) missing.push(`${locale}: ${key}.${form}`)
                }
            }
        }
        expect(missing).toEqual([])
    })

    it('every t() key used in source exists in the en catalog', () => {
        const missing: string[] = []
        for (const match of allSource.matchAll(/\bt\(\s*'([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)'/g)) {
            const key = match[1]
            if (key !== undefined && !(key in en)) missing.push(key)
        }
        expect([...new Set(missing)]).toEqual([])
    })
})
