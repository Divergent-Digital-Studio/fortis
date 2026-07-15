import { describe, it, expect } from 'vitest'
import { brandingHeaderHtml } from './report-branding'

describe('report-branding', () => {
    it('emits an org-named header with the accent color when branding is set', () => {
        const html = brandingHeaderHtml({ orgName: 'Acme Corp', accentColor: '#ff0000' })
        expect(html).toContain('Acme Corp')
        expect(html).toContain('#ff0000')
    })
    it('falls back to the product name when no org is set', () => {
        const html = brandingHeaderHtml({ orgName: '', accentColor: '#3b82f6' })
        expect(html).toContain('Fortis')
    })
    it('escapes HTML in the org name', () => {
        const html = brandingHeaderHtml({ orgName: '<script>x</script>', accentColor: '#000' })
        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;')
    })
    it('rejects an invalid accent color and falls back to the default', () => {
        const html = brandingHeaderHtml({ orgName: 'X', accentColor: 'red; }malicious' })
        expect(html).toContain('#3b82f6')
        expect(html).not.toContain('malicious')
    })
})
