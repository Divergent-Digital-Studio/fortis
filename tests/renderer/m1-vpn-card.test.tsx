import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { VpnLeakStatus } from '@shared/types/m1'
import type { UseVpnStatusResult } from '@renderer/hooks/useVpnStatus'

const mockUseVpnStatus = vi.fn<() => UseVpnStatusResult>()
vi.mock('@renderer/hooks/useVpnStatus', () => ({
    default: () => mockUseVpnStatus(),
}))

import VpnStatusCard from '@renderer/components/vpn/VpnStatusCard'

function status(overrides: Partial<VpnLeakStatus> = {}): VpnLeakStatus {
    return {
        verdict: 'pass',
        tunnelActive: true,
        tunnelInterface: 'utun3',
        defaultRouteThroughTunnel: true,
        explanation: 'VPN tunnel utun3 is active and carrying your default route.',
        timestamp: Date.now(),
        ...overrides,
    }
}

function result(value: VpnLeakStatus | null): UseVpnStatusResult {
    return { status: value, isLoading: false, error: null, refresh: vi.fn() }
}

beforeEach(() => {
    mockUseVpnStatus.mockReset()
})

describe('VpnStatusCard', () => {
    it('renders the pass state with the protected label and explanation', () => {
        mockUseVpnStatus.mockReturnValue(result(status()))
        render(<VpnStatusCard />)
        expect(screen.getByText('Protected')).toBeInTheDocument()
        expect(
            screen.getByText('VPN tunnel utun3 is active and carrying your default route.'),
        ).toBeInTheDocument()
        expect(screen.getByText('utun3')).toBeInTheDocument()
    })

    it('renders the warn state when no VPN tunnel is present', () => {
        mockUseVpnStatus.mockReturnValue(
            result(
                status({
                    verdict: 'warn',
                    tunnelActive: false,
                    tunnelInterface: null,
                    defaultRouteThroughTunnel: false,
                    explanation: 'No VPN tunnel detected. Traffic is unprotected by a VPN.',
                }),
            ),
        )
        render(<VpnStatusCard />)
        expect(screen.getByText('No VPN')).toBeInTheDocument()
        expect(
            screen.getByText('No VPN tunnel detected. Traffic is unprotected by a VPN.'),
        ).toBeInTheDocument()
    })

    it('renders the fail state when traffic leaks outside the tunnel', () => {
        mockUseVpnStatus.mockReturnValue(
            result(
                status({
                    verdict: 'fail',
                    defaultRouteThroughTunnel: false,
                    tunnelInterface: 'wg0',
                    explanation: 'A VPN tunnel (wg0) is up, but traffic is leaving through en0 — possible leak.',
                }),
            ),
        )
        render(<VpnStatusCard />)
        expect(screen.getByText('Leak Detected')).toBeInTheDocument()
        expect(
            screen.getByText('A VPN tunnel (wg0) is up, but traffic is leaving through en0 — possible leak.'),
        ).toBeInTheDocument()
    })
})
