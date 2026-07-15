import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DnsQueryRecord } from '@shared/types/m1'
import type { UseDnsQueriesResult } from '@renderer/hooks/useDnsQueries'

const mockUseDnsQueries = vi.fn<() => UseDnsQueriesResult>()
vi.mock('@renderer/hooks/useDnsQueries', () => ({
    default: () => mockUseDnsQueries(),
}))

import DnsView from '@renderer/components/dns/DnsView'

function record(overrides: Partial<DnsQueryRecord> = {}): DnsQueryRecord {
    const now = Date.now()
    return {
        id: 'dns-1',
        domain: 'example.com',
        resolvedIp: '93.184.216.34',
        source: 'cache',
        processName: 'firefox',
        firstSeen: now - 60 * 1000,
        lastSeen: now,
        hitCount: 3,
        ...overrides,
    }
}

function result(records: DnsQueryRecord[]): UseDnsQueriesResult {
    return { records, isLoading: false, error: null, refresh: vi.fn() }
}

beforeEach(() => {
    mockUseDnsQueries.mockReset()
    localStorage.clear()
})

/** The view opens on the orbit; the table is one click away. */
async function showTable(): Promise<void> {
    await userEvent.setup().click(screen.getByRole('button', { name: 'Table' }))
}

describe('DnsView', () => {
    it('renders a DNS row with domain and resolved IP', async () => {
        mockUseDnsQueries.mockReturnValue(result([record()]))
        render(<DnsView />)
        await showTable()
        expect(screen.getByText('example.com')).toBeInTheDocument()
        expect(screen.getByText('93.184.216.34')).toBeInTheDocument()
    })

    it('shows the source badge text', async () => {
        mockUseDnsQueries.mockReturnValue(result([record({ source: 'ptr' })]))
        render(<DnsView />)
        await showTable()
        expect(screen.getByText('ptr')).toBeInTheDocument()
    })

    it('renders an empty state when there are no records', () => {
        mockUseDnsQueries.mockReturnValue(result([]))
        render(<DnsView />)
        expect(screen.getByText('No DNS queries found')).toBeInTheDocument()
    })

    it('defaults to the orbit and plots each resolved domain', () => {
        mockUseDnsQueries.mockReturnValue(result([record()]))
        const { container } = render(<DnsView />)
        expect(container.querySelector('.hub-orbit__svg')).not.toBeNull()
        expect(screen.getByRole('button', { name: 'example.com' })).toBeInTheDocument()
    })

    it('collapses subdomains of one parent into a single orbit node', () => {
        const records = [
            record({ id: 'a', domain: 'ec2-1-2-3-4.compute.amazonaws.com', source: 'ptr', hitCount: 2 }),
            record({ id: 'b', domain: 'ec2-5-6-7-8.compute.amazonaws.com', source: 'ptr', hitCount: 3 }),
            record({ id: 'c', domain: 'api.github.com', hitCount: 9 }),
        ]
        mockUseDnsQueries.mockReturnValue(result(records))
        const { container } = render(<DnsView />)

        // Three records, two parents: amazonaws (grouped) and github.
        expect(container.querySelectorAll('.hub-orbit__node').length).toBe(2)
        expect(screen.getByRole('button', { name: 'compute.amazonaws.com (2)' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'github.com' })).toBeInTheDocument()
        expect(screen.getByText('2 domains · 3 queries')).toBeInTheDocument()
    })

    it('lists a group\'s member hostnames when it is selected', async () => {
        const records = [
            record({ id: 'a', domain: 'ec2-1-2-3-4.compute.amazonaws.com', source: 'ptr', hitCount: 2 }),
            record({ id: 'b', domain: 'ec2-5-6-7-8.compute.amazonaws.com', source: 'ptr', hitCount: 3 }),
        ]
        mockUseDnsQueries.mockReturnValue(result(records))
        const { container } = render(<DnsView />)

        await userEvent.setup().click(screen.getByRole('button', { name: 'compute.amazonaws.com (2)' }))

        // Clicking also hovers, so the tooltip lists the same members. Scope to the panel.
        const panel = container.querySelector('.page-panel') as HTMLElement
        expect(panel).not.toBeNull()
        expect(within(panel).getByText('ec2-1-2-3-4.compute.amazonaws.com')).toBeInTheDocument()
        expect(within(panel).getByText('ec2-5-6-7-8.compute.amazonaws.com')).toBeInTheDocument()
    })

    it('opens a tooltip with the group facts on hover', async () => {
        const records = [
            record({ id: 'a', domain: 'ec2-1-2-3-4.compute.amazonaws.com', source: 'ptr', hitCount: 2 }),
            record({ id: 'b', domain: 'ec2-5-6-7-8.compute.amazonaws.com', source: 'ptr', hitCount: 3 }),
        ]
        mockUseDnsQueries.mockReturnValue(result(records))
        render(<DnsView />)

        await userEvent.setup().hover(screen.getByRole('button', { name: 'compute.amazonaws.com (2)' }))

        const tooltip = await screen.findByRole('tooltip')
        expect(within(tooltip).getByText('compute.amazonaws.com')).toBeInTheDocument()
        expect(within(tooltip).getByText('ec2-5-6-7-8.compute.amazonaws.com')).toBeInTheDocument()
    })

    it('still lists every raw record in the table', async () => {
        const records = [
            record({ id: 'a', domain: 'ec2-1-2-3-4.compute.amazonaws.com', source: 'ptr' }),
            record({ id: 'b', domain: 'ec2-5-6-7-8.compute.amazonaws.com', source: 'ptr' }),
        ]
        mockUseDnsQueries.mockReturnValue(result(records))
        render(<DnsView />)
        await showTable()

        // Grouping is a visual concern; the table must not hide rows.
        expect(screen.getByText('ec2-1-2-3-4.compute.amazonaws.com')).toBeInTheDocument()
        expect(screen.getByText('ec2-5-6-7-8.compute.amazonaws.com')).toBeInTheDocument()
    })
})
