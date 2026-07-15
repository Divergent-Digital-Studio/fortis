import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../..')

function read(relative: string): string {
    return readFileSync(resolve(root, relative), 'utf8')
}

/** Custom properties declared anywhere in the theme, light or dark. */
function definedTokens(): Set<string> {
    const source = read('src/renderer/styles/variables.css')
    return new Set(Array.from(source.matchAll(/^\s*(--[\w-]+)\s*:/gm), (m) => m[1]!))
}

/** `var(--x)` with no fallback: an undefined one silently drops the declaration. */
function requiredTokens(relative: string): string[] {
    const source = read(relative)
    return Array.from(new Set(Array.from(source.matchAll(/var\((--[\w-]+)\)/g), (m) => m[1]!)))
}

const ORBIT_STYLESHEETS = [
    'src/renderer/styles/components/devices-view.css',
    'src/renderer/styles/components/orbit-tooltip.css',
    'src/renderer/styles/components/hub-orbit.css',
    'src/renderer/styles/components/page-shell.css',
]

/** Set inline by each legend modifier rather than declared in the theme. */
const LOCALLY_SCOPED = new Set(['--legend-dot'])

describe('orbit view design tokens', () => {
    it.each(ORBIT_STYLESHEETS)('references only tokens the theme defines: %s', (sheet) => {
        // A missing token drops the whole declaration, so a transparent tooltip
        // or an invisible divider ships looking like a z-index bug.
        const defined = definedTokens()
        const missing = requiredTokens(sheet).filter(
            (token) => !LOCALLY_SCOPED.has(token) && !defined.has(token),
        )
        expect(missing).toEqual([])
    })

    it('gives the tooltip an opaque background so the orbit cannot show through', () => {
        const source = read('src/renderer/styles/components/orbit-tooltip.css')
        const block = source.slice(source.indexOf('.orbit-tooltip {'))
        const background = /background:\s*var\((--[\w-]+)\)/.exec(block)?.[1]

        expect(background).toBeDefined()
        expect(definedTokens().has(background!)).toBe(true)
    })
})
