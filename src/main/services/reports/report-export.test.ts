import { describe, it, expect } from 'vitest'
import { exportReport, toCsv } from './report-export'
import type { WeeklyReport } from '@shared/types/m2'

const report: WeeklyReport = {
    id: 'r1',
    generatedAt: 1000,
    periodStart: 0,
    periodEnd: 1000,
    summary: 'All good',
    healthScore: 80,
    topProcesses: [{ name: 'chrome', count: 5 }],
    topDestinations: [{ address: '1.1.1.1', country: 'US', count: 5 }],
    threatCount: 0,
    newDeviceCount: 1,
    generatedBy: 'ai',
}

describe('exportReport', () => {
    it('exports valid JSON that round-trips', () => {
        expect(JSON.parse(exportReport(report, 'json'))).toMatchObject({ id: 'r1', summary: 'All good' })
    })

    it('exports markdown containing key fields', () => {
        const md = exportReport(report, 'markdown')
        expect(md).toContain('All good')
        expect(md).toContain('chrome')
        expect(md).toContain('# ')
    })

    it('exports html escaping angle brackets in summary', () => {
        const html = exportReport({ ...report, summary: '<script>' }, 'html')
        expect(html).toContain('&lt;script&gt;')
        expect(html).toContain('<!DOCTYPE html>')
    })

    it('returns an empty string for pdf', () => {
        expect(exportReport(report, 'pdf')).toBe('')
    })

    it('exports csv via the format switch', () => {
        const csv = exportReport(report, 'csv')
        expect(csv.split('\n')[0]).toContain('id')
    })
})

describe('toCsv', () => {
    it('produces a header row and data row', () => {
        const csv = toCsv(report)
        const lines = csv.trim().split('\n')
        expect(lines[0]).toContain('id')
        expect(lines[0]).toContain('healthScore')
        expect(lines.length).toBeGreaterThanOrEqual(2)
        expect(lines[1]).toContain('r1')
        expect(lines[1]).toContain('chrome:5')
        expect(lines[1]).toContain('1.1.1.1(US):5')
    })

    it('escapes commas and quotes', () => {
        const csv = toCsv({ ...report, summary: 'a,b "c"' })
        expect(csv).toContain('"a,b ""c"""')
    })
})
