import { describe, it, expect, vi, beforeEach } from 'vitest'

let packaged = true

vi.mock('electron', () => ({
    app: {
        get isPackaged(): boolean {
            return packaged
        },
    },
    session: {
        defaultSession: {
            webRequest: {
                onHeadersReceived: (): void => {},
            },
        },
    },
}))

import { buildCSP } from '@main/security'

describe('SEC-06 CSP style policy', () => {
    beforeEach(() => {
        packaged = true
    })

    it('production CSP does not allow unsafe-inline for style elements', () => {
        packaged = true
        const csp = buildCSP()
        const directives = csp.split(';').map((d) => d.trim())

        const styleSrc = directives.find((d) => d.startsWith('style-src ') || d === 'style-src')
        expect(styleSrc).toBeDefined()
        expect(styleSrc).toContain("'self'")
        expect(styleSrc).not.toContain("'unsafe-inline'")
    })

    it('production CSP keeps style-src-attr unsafe-inline for inline style attributes', () => {
        packaged = true
        const csp = buildCSP()
        const directives = csp.split(';').map((d) => d.trim())

        const styleSrcAttr = directives.find((d) => d.startsWith('style-src-attr'))
        expect(styleSrcAttr).toBeDefined()
        expect(styleSrcAttr).toContain("'unsafe-inline'")
    })

    it('production CSP keeps script-src self without unsafe-inline', () => {
        packaged = true
        const csp = buildCSP()
        const directives = csp.split(';').map((d) => d.trim())

        const scriptSrc = directives.find((d) => d.startsWith('script-src'))
        expect(scriptSrc).toBe("script-src 'self'")
    })

    it('development CSP keeps unsafe-inline on style-src for HMR', () => {
        packaged = false
        const csp = buildCSP()
        const directives = csp.split(';').map((d) => d.trim())

        const styleSrc = directives.find((d) => d.startsWith('style-src ') || d === 'style-src')
        expect(styleSrc).toContain("'unsafe-inline'")
    })
})
