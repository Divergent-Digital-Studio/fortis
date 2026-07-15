import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

describe('BUILD-12 worker entry is emitted and referenced as .js', () => {
    it('parser-worker resolves the worker as a .js file, not a .ts file', () => {
        const source = readFileSync(resolve(ROOT, 'src/main/utils/parsers/parser-worker.ts'), 'utf8')
        expect(source).toMatch(/parser-worker-entry\.js/)
        expect(source).not.toMatch(/parser-worker-entry\.ts/)
    })

    it('electron.vite.config declares the worker entry as a build input', () => {
        const config = readFileSync(resolve(ROOT, 'electron.vite.config.ts'), 'utf8')
        expect(config).toMatch(/parser-worker-entry/)
    })
})
