import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let mockTier = 'pro'

vi.mock('@renderer/hooks/useConnectionStats', () => ({
    default: () => ({ stats: { totalActive: 12, uniqueProcesses: 4, uniqueRemoteAddresses: 7 } }),
}))
vi.mock('@renderer/hooks/useDevices', () => ({
    default: () => ({ devices: [{ mac: 'a' }, { mac: 'b' }] }),
}))
vi.mock('@renderer/hooks/useDnsQueries', () => ({
    default: () => ({ records: [{ id: '1' }, { id: '2' }, { id: '3' }] }),
}))
vi.mock('@renderer/hooks/useGeoConnections', () => ({
    default: () => ({ connections: [{ countryCode: 'US' }, { countryCode: 'DE' }, { countryCode: 'US' }] }),
}))
vi.mock('@renderer/hooks/useIotDevices', () => ({
    default: () => ({ devices: [{ mac: 'c' }] }),
}))
vi.mock('@renderer/stores', () => ({
    useSettingsStore: (selector: (s: { settings: { aiProvider: string; tier: string } }) => unknown) =>
        selector({ settings: { aiProvider: 'openai', tier: mockTier } }),
    selectTier: (s: { settings: { tier: string } }) => s.settings.tier,
    UpgradePrompt: () => null,
}))
vi.mock('@renderer/components/common', () => ({
    UpgradePrompt: () => null,
}))
vi.mock('@renderer/stores/alert-store', () => ({
    useAlertStore: (selector: (s: { alertCounts: { unacknowledged: number } }) => unknown) =>
        selector({ alertCounts: { unacknowledged: 5 } }),
}))

import StatsRow from '@renderer/components/dashboard/StatsRow'

beforeEach(() => {
    mockTier = 'pro'
})

describe('StatsRow enriched dashboard', () => {
    it('renders all eight stat cards', () => {
        render(<StatsRow />)
        for (const label of ['Active Connections', 'Active Processes', 'Flagged Connections', 'AI Provider', 'Devices', 'DNS Domains', 'Countries', 'IoT Devices']) {
            expect(screen.getByText(label)).toBeInTheDocument()
        }
    })

    it('shows real M1 values (not locked placeholders) on a paid tier', () => {
        render(<StatsRow />)
        expect(screen.queryAllByRole('button', { name: /upgrade to unlock/ })).toHaveLength(0)
        expect(screen.getByText('12')).toBeInTheDocument()
        expect(screen.getByText('Configured')).toBeInTheDocument()
    })

    it('locks the advanced cards on the free tier', () => {
        mockTier = 'free'
        render(<StatsRow />)
        const lockedButtons = screen.getAllByRole('button', { name: /upgrade to unlock/ })
        expect(lockedButtons).toHaveLength(4)
    })
})
