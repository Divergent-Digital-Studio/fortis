import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { WeeklyReport } from '@shared/types/m2'
import type { UseReportsResult } from '@renderer/hooks/useReports'

const mockUseReports = vi.fn<() => UseReportsResult>()
vi.mock('@renderer/hooks/useReports', () => ({
    default: () => mockUseReports(),
}))

let mockTier = 'pro'
vi.mock('@renderer/stores', () => ({
    useSettingsStore: (selector: (s: { settings: { tier: string } }) => unknown) =>
        selector({ settings: { tier: mockTier } }),
    selectTier: (s: { settings: { tier: string } }) => s.settings.tier,
}))

import ReportsView from '@renderer/components/reports/ReportsView'

function report(overrides: Partial<WeeklyReport> = {}): WeeklyReport {
    const now = Date.now()
    return {
        id: 'r1',
        generatedAt: now,
        periodStart: now - 7 * 24 * 60 * 60 * 1000,
        periodEnd: now,
        summary: 'Weekly summary text',
        healthScore: 82,
        topProcesses: [{ name: 'chrome', count: 9 }],
        topDestinations: [{ address: '1.1.1.1', country: 'US', count: 9 }],
        threatCount: 1,
        newDeviceCount: 2,
        generatedBy: 'ai',
        ...overrides,
    }
}

function result(reports: WeeklyReport[], over: Partial<UseReportsResult> = {}): UseReportsResult {
    return {
        reports,
        isLoading: false,
        isGenerating: false,
        error: null,
        refresh: vi.fn(),
        generate: vi.fn(),
        exportReport: vi.fn(),
        ...over,
    }
}

beforeEach(() => {
    mockUseReports.mockReset()
    mockTier = 'pro'
})

describe('ReportsView', () => {
    it('renders a report card with summary and all export buttons', () => {
        mockUseReports.mockReturnValue(result([report()]))
        render(<ReportsView />)
        expect(screen.getByText('Weekly summary text')).toBeInTheDocument()
        expect(screen.getByText('JSON')).toBeInTheDocument()
        expect(screen.getByText('Markdown')).toBeInTheDocument()
        expect(screen.getByText('HTML')).toBeInTheDocument()
        expect(screen.getByText('CSV')).toBeInTheDocument()
        expect(screen.getByText('PDF')).toBeInTheDocument()
    })

    it('calls exportReport with csv when CSV is clicked', () => {
        const exportReport = vi.fn()
        mockUseReports.mockReturnValue(result([report()], { exportReport }))
        render(<ReportsView />)
        fireEvent.click(screen.getByText('CSV'))
        expect(exportReport).toHaveBeenCalledWith('r1', 'csv')
    })

    it('calls exportReport with pdf when PDF is clicked', () => {
        const exportReport = vi.fn()
        mockUseReports.mockReturnValue(result([report()], { exportReport }))
        render(<ReportsView />)
        fireEvent.click(screen.getByText('PDF'))
        expect(exportReport).toHaveBeenCalledWith('r1', 'pdf')
    })

    it('calls generate when "Generate now" is clicked', () => {
        const generate = vi.fn()
        mockUseReports.mockReturnValue(result([report()], { generate }))
        render(<ReportsView />)
        fireEvent.click(screen.getByText('Generate now'))
        expect(generate).toHaveBeenCalled()
    })

    it('shows EmptyState when there are no reports', () => {
        mockUseReports.mockReturnValue(result([]))
        render(<ReportsView />)
        expect(screen.getByText('No reports yet')).toBeInTheDocument()
    })

    it('locks older reports for the free tier', () => {
        mockTier = 'free'
        mockUseReports.mockReturnValue(result([report({ id: 'a' }), report({ id: 'b' }), report({ id: 'c' })]))
        render(<ReportsView />)
        expect(screen.getByText(/older report\(s\) locked/)).toBeInTheDocument()
    })
})
