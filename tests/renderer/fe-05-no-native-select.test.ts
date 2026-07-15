import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const COMPONENTS_DIR = resolve(__dirname, '../../src/renderer/components')
const NATIVE_SELECT_RE = /<select(\s|>)/

function collectTsx(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            collectTsx(full, acc)
        } else if (entry.endsWith('.tsx')) {
            acc.push(full)
        }
    }
    return acc
}

describe('FE-05 no native <select> remains in renderer components', () => {
    it('contains no native <select> element in any component tsx', () => {
        const offenders: string[] = []
        for (const file of collectTsx(COMPONENTS_DIR)) {
            const content = readFileSync(file, 'utf8')
            if (NATIVE_SELECT_RE.test(content)) {
                offenders.push(file)
            }
        }
        expect(offenders).toEqual([])
    })
})
