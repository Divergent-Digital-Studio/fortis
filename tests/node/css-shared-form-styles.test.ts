import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const COMPONENTS_DIR = join(process.cwd(), 'src/renderer/components')

function tsxFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return tsxFiles(path)
        return entry.name.endsWith('.tsx') ? [path] : []
    })
}

/** The form primitives (`settings-input`, `settings-field__*`, …) all live in settings.css. */
const SHARED_FORM_CLASS = /\bsettings-(?:input|field|section|toggle|note)\b/

describe('shared form styles are imported by every view that uses them', () => {
    // settings.css is loaded by SettingsView, which is lazy. A view that borrows
    // `settings-input` without importing the stylesheet renders unstyled native
    // controls until the user happens to open Settings first. Nothing else catches
    // this: it typechecks, tests, and builds while looking broken.
    it('any component using a settings-* form class imports settings.css', () => {
        const offenders = tsxFiles(COMPONENTS_DIR).filter((file) => {
            // components/settings/* only ever render inside SettingsView, which imports it.
            if (file.includes(`${sep}settings${sep}`)) return false
            const source = readFileSync(file, 'utf8')
            if (!SHARED_FORM_CLASS.test(source)) return false
            return !source.includes('styles/components/settings.css')
        })

        expect(offenders.map((f) => relative(process.cwd(), f))).toEqual([])
    })
})
