import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WifiDevice } from '@shared/types/m1'
import type { NetworkConnection } from '@shared/types/connection'
import type { UseDevicesResult } from '@renderer/hooks/useDevices'
import type { UseConnectionsResult } from '@renderer/hooks/useConnections'

const mockUseDevices = vi.fn<() => UseDevicesResult>()
vi.mock('@renderer/hooks/useDevices', () => ({
    default: () => mockUseDevices(),
}))

const mockUseConnections = vi.fn<() => UseConnectionsResult>()
vi.mock('@renderer/hooks/useConnections', () => ({
    default: () => mockUseConnections(),
}))

import DevicesView from '@renderer/components/devices/DevicesView'

function device(overrides: Partial<WifiDevice> = {}): WifiDevice {
    const now = Date.now()
    return {
        mac: 'A4B1C2112233',
        ip: '192.168.1.20',
        vendor: 'Nest Labs Inc.',
        hostname: null,
        customName: null,
        firstSeen: now - 60 * 60 * 1000,
        lastSeen: now,
        isIot: true,
        iotCategory: 'smart-home',
        ...overrides,
    }
}

function result(devices: WifiDevice[]): UseDevicesResult {
    return { devices, isLoading: false, error: null, refresh: vi.fn() }
}

function connection(overrides: Partial<NetworkConnection> = {}): NetworkConnection {
    return {
        id: 'c1',
        protocol: 'tcp',
        localAddress: '192.168.1.5',
        localPort: 51234,
        remoteAddress: '192.168.1.20',
        remotePort: 443,
        state: 'ESTABLISHED',
        processName: 'Safari',
        processId: 900,
        timestamp: Date.now(),
        ...overrides,
    }
}

/**
 * Selects a node and moves the pointer away, so the hover tooltip closes and the
 * returned panel is the only place the device's details are on screen. The close
 * is deferred, hence the wait.
 */
async function selectDevice(name: string): Promise<HTMLElement> {
    const node = screen.getByRole('button', { name: new RegExp(name) })
    await userEvent.click(node)
    await userEvent.unhover(node)
    await waitForElementToBeRemoved(() => screen.queryByRole('tooltip'))
    return screen.getByRole('complementary', { name: 'Device details' })
}

function connectionsResult(connections: NetworkConnection[] = []): UseConnectionsResult {
    return { connections, isLoading: false, error: null, refresh: vi.fn() }
}

beforeEach(() => {
    mockUseDevices.mockReset()
    mockUseConnections.mockReset()
    mockUseConnections.mockReturnValue(connectionsResult())
})

describe('DevicesView', () => {
    it('renders a device node labelled with its name', () => {
        mockUseDevices.mockReturnValue(result([device()]))
        render(<DevicesView />)
        expect(screen.getByRole('button', { name: /Nest Labs Inc\./ })).toBeInTheDocument()
    })

    it('shows IP and MAC in the panel once a device is selected', async () => {
        mockUseDevices.mockReturnValue(result([device()]))
        render(<DevicesView />)
        expect(screen.queryByText('192.168.1.20')).not.toBeInTheDocument()

        const panel = await selectDevice('Nest Labs Inc.')

        expect(within(panel).getByText('192.168.1.20')).toBeInTheDocument()
        expect(within(panel).getByText('A4B1C2112233')).toBeInTheDocument()
    })

    it('shows a custom name when one is set, falling back from hostname/vendor', async () => {
        mockUseDevices.mockReturnValue(result([device({ customName: 'Front Doorbell' })]))
        render(<DevicesView />)
        const panel = await selectDevice('Front Doorbell')
        // The vendor is still surfaced, now as a panel fact rather than a column.
        expect(within(panel).getByText('Nest Labs Inc.')).toBeInTheDocument()
    })

    it('shows a NEW badge for a device first seen within 24h', async () => {
        mockUseDevices.mockReturnValue(result([device({ firstSeen: Date.now() - 1000 })]))
        render(<DevicesView />)
        const panel = await selectDevice('Nest Labs Inc.')
        expect(within(panel).getByText('NEW')).toBeInTheDocument()
    })

    it('does not show NEW for an old device', async () => {
        mockUseDevices.mockReturnValue(result([device({ firstSeen: Date.now() - 48 * 60 * 60 * 1000 })]))
        render(<DevicesView />)
        const panel = await selectDevice('Nest Labs Inc.')
        expect(within(panel).queryByText('NEW')).not.toBeInTheDocument()
    })

    it('closes the panel when the selected device is filtered out', async () => {
        mockUseDevices.mockReturnValue(result([device()]))
        render(<DevicesView />)
        await selectDevice('Nest Labs Inc.')
        expect(screen.getByText('192.168.1.20')).toBeInTheDocument()

        await userEvent.type(screen.getByLabelText(/Search name, vendor/), 'no-such-device')

        expect(screen.queryByText('192.168.1.20')).not.toBeInTheDocument()
        expect(screen.getByText('No devices found')).toBeInTheDocument()
    })

    it("lists the selected device's connections, matched on the remote address", async () => {
        mockUseDevices.mockReturnValue(result([device()]))
        mockUseConnections.mockReturnValue(
            connectionsResult([
                connection({ id: 'mine', processName: 'Safari' }),
                // Same IP, but as the local end — this host's own socket, not the device's.
                connection({ id: 'other', processName: 'Spotify', remoteAddress: '203.0.113.9' }),
            ]),
        )
        render(<DevicesView />)
        const panel = await selectDevice('Nest Labs Inc.')

        expect(within(panel).getByText('Safari')).toBeInTheDocument()
        expect(within(panel).queryByText('Spotify')).not.toBeInTheDocument()
        expect(within(panel).getByText('ESTABLISHED')).toBeInTheDocument()
    })

    it('reports when the selected device has no active connections', async () => {
        mockUseDevices.mockReturnValue(result([device()]))
        mockUseConnections.mockReturnValue(connectionsResult([connection({ remoteAddress: '203.0.113.9' })]))
        render(<DevicesView />)
        const panel = await selectDevice('Nest Labs Inc.')

        expect(within(panel).getByText(/No active connections/)).toBeInTheDocument()
    })

    it('shows a tooltip with the device details and connections on hover', async () => {
        mockUseDevices.mockReturnValue(result([device()]))
        mockUseConnections.mockReturnValue(connectionsResult([connection({ processName: 'Safari' })]))
        render(<DevicesView />)

        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

        await userEvent.hover(screen.getByRole('button', { name: /Nest Labs Inc\./ }))

        const tooltip = screen.getByRole('tooltip')
        expect(within(tooltip).getByText('192.168.1.20')).toBeInTheDocument()
        expect(within(tooltip).getByText('A4B1C2112233')).toBeInTheDocument()
        expect(within(tooltip).getByText('Safari')).toBeInTheDocument()
        expect(within(tooltip).getByText('1 active connection')).toBeInTheDocument()
    })

    it('hides the tooltip shortly after the pointer leaves the node', async () => {
        mockUseDevices.mockReturnValue(result([device()]))
        render(<DevicesView />)
        const node = screen.getByRole('button', { name: /Nest Labs Inc\./ })

        await userEvent.hover(node)
        expect(screen.getByRole('tooltip')).toBeInTheDocument()

        await userEvent.unhover(node)
        // The close is deferred, so brushing across the orbit does not make it blink.
        expect(screen.getByRole('tooltip')).toBeInTheDocument()
        await waitForElementToBeRemoved(() => screen.queryByRole('tooltip'))
    })

    it('shows the newly hovered device when the pointer moves between nodes', async () => {
        mockUseDevices.mockReturnValue(
            result([device(), device({ mac: 'B1B1B1B1B1B1', ip: '192.168.1.21', customName: 'Printer' })]),
        )
        render(<DevicesView />)

        await userEvent.hover(screen.getByRole('button', { name: /Nest Labs Inc\./ }))
        await userEvent.hover(screen.getByRole('button', { name: /Printer/ }))

        expect(within(screen.getByRole('tooltip')).getByText('Printer')).toBeInTheDocument()
    })

    it('renders an empty state when there are no devices', () => {
        mockUseDevices.mockReturnValue(result([]))
        render(<DevicesView />)
        expect(screen.getByText('No devices found')).toBeInTheDocument()
    })
})
