import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const STYLES_DIR = join(process.cwd(), 'src/renderer/styles')

function cssFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return cssFiles(path)
        return entry.name.endsWith('.css') ? [path] : []
    })
}

const files = cssFiles(STYLES_DIR)
const allCss = files.map((f) => readFileSync(f, 'utf8')).join('\n')

/** `--foo: value` — a definition. */
const defined = new Set([...allCss.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]!))

/** `var(--foo)` or `var(--foo, fallback)` — a usage. */
function usages(css: string): string[] {
    return [...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]!)
}

describe('CSS custom properties', () => {
    // An undefined custom property does not error: it silently falls back to
    // the inherited/initial value. It passes typecheck, tests and build while
    // rendering wrong. This guard is the only thing that catches it.
    it('every var(--token) used is defined somewhere in the stylesheets', () => {
        const orphans: string[] = []
        for (const file of files) {
            const css = readFileSync(file, 'utf8')
            for (const token of usages(css)) {
                if (!defined.has(token)) orphans.push(`${file.replace(process.cwd() + '/', '')}: ${token}`)
            }
        }
        expect([...new Set(orphans)]).toEqual([])
    })

    it('finds a meaningful number of definitions (guard is actually reading the files)', () => {
        expect(defined.size).toBeGreaterThan(40)
        expect(files.length).toBeGreaterThan(5)
    })
})
