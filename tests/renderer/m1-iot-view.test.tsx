import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { IotDevice } from '@shared/types/m1'
import type { UseIotDevicesResult } from '@renderer/hooks/useIotDevices'

const mockUseIotDevices = vi.fn<() => UseIotDevicesResult>()
vi.mock('@renderer/hooks/useIotDevices', () => ({
    default: () => mockUseIotDevices(),
}))

import IotView from '@renderer/components/iot/IotView'

function device(overrides: Partial<IotDevice> = {}): IotDevice {
    return {
        mac: 'AABBCCDDEEFF',
        ip: '192.168.1.50',
        vendor: 'Acme Cameras',
        name: 'Acme Cameras',
        category: 'camera',
        firstSeen: 1_700_000_000_000,
        lastSeen: 1_700_000_900_000,
        destinations: ['United States'],
        hasAnomaly: false,
        anomalyReason: null,
        ...overrides,
    }
}

function result(devices: IotDevice[], overrides: Partial<UseIotDevicesResult> = {}): UseIotDevicesResult {
    return { devices, isLoading: false, error: null, refresh: vi.fn(), ...overrides }
}

beforeEach(() => {
    mockUseIotDevices.mockReset()
    localStorage.clear()
})

/** The view opens on the orbit; the table is one click away. */
async function showTable(): Promise<void> {
    await userEvent.setup().click(screen.getByRole('button', { name: 'Table' }))
}

describe('IotView', () => {
    it('renders an IoT device row with vendor and category', async () => {
        mockUseIotDevices.mockReturnValue(result([device()]))
        render(<IotView />)
        await showTable()
        expect(screen.getByRole('table', { name: 'IoT devices' })).toBeInTheDocument()
        // The fixture's name and vendor are both "Acme Cameras".
        expect(screen.getAllByText('Acme Cameras').length).toBe(2)
        expect(screen.getByText('camera')).toBeInTheDocument()
    })

    it('marks an anomalous device on the orbit', () => {
        mockUseIotDevices.mockReturnValue(result([device({ hasAnomaly: true })]))
        const { container } = render(<IotView />)
        expect(container.querySelector('.hub-orbit__node--warning')).not.toBeNull()
    })

    it('opens a tooltip with the device facts on hover', async () => {
        mockUseIotDevices.mockReturnValue(result([device()]))
        render(<IotView />)

        await userEvent.setup().hover(screen.getByRole('button', { name: 'Acme Cameras' }))

        const tooltip = await screen.findByRole('tooltip')
        expect(within(tooltip).getByText('192.168.1.50')).toBeInTheDocument()
        expect(within(tooltip).getByText('AABBCCDDEEFF')).toBeInTheDocument()
    })

    it('shows an empty state when there are no IoT devices', () => {
        mockUseIotDevices.mockReturnValue(result([]))
        render(<IotView />)
        expect(screen.getByText('No IoT devices')).toBeInTheDocument()
    })

    it('shows a loading empty state while the first fetch is in flight', () => {
        mockUseIotDevices.mockReturnValue(result([], { isLoading: true }))
        render(<IotView />)
        expect(screen.getByText('Discovering IoT devices…')).toBeInTheDocument()
    })

    describe('the anomaly is network-wide, not per-device', () => {
        it('surfaces it once as a page banner rather than a per-row badge', async () => {
            mockUseIotDevices.mockReturnValue(
                result([
                    device({ hasAnomaly: true, anomalyReason: 'New destination country: Russia' }),
                    device({ mac: 'FFEEDDCCBBAA', name: 'Smart Bulb', hasAnomaly: true, anomalyReason: 'New destination country: Russia' }),
                ]),
            )
            const { container } = render(<IotView />)

            const banners = screen.getAllByRole('status')
            expect(banners).toHaveLength(1)
            expect(banners[0]).toHaveTextContent('Network anomaly: New destination country: Russia')

            // Not repeated per row: the table has no anomaly column at all.
            await showTable()
            expect(container.querySelectorAll('.iot-view__anomaly')).toHaveLength(1)
        })

        it('labels the panel destinations as network-scoped', async () => {
            mockUseIotDevices.mockReturnValue(result([device()]))
            const { container } = render(<IotView />)

            await userEvent.setup().click(screen.getByRole('button', { name: 'Acme Cameras' }))

            const panel = container.querySelector('.page-panel')
            expect(panel).not.toBeNull()
            const scoped = within(panel as HTMLElement)
            expect(scoped.getByText('Network destinations (countries)')).toBeInTheDocument()
            expect(
                scoped.getByText('Observed across the whole network, not attributed to this device.'),
            ).toBeInTheDocument()
            expect(scoped.getByText('United States')).toBeInTheDocument()
        })
    })

    describe('error handling', () => {
        it('renders a full error state with retry when nothing loaded', async () => {
            const refresh = vi.fn()
            mockUseIotDevices.mockReturnValue(result([], { error: 'IPC exploded', refresh }))
            render(<IotView />)

            expect(screen.getByText('Failed to load IoT devices')).toBeInTheDocument()
            expect(screen.getByText('IPC exploded')).toBeInTheDocument()

            await userEvent.setup().click(screen.getByRole('button', { name: /retry/i }))
            expect(refresh).toHaveBeenCalledOnce()
        })

        it('renders a stale-data banner when a refresh fails over existing devices', async () => {
            const refresh = vi.fn()
            mockUseIotDevices.mockReturnValue(result([device()], { error: 'Refresh failed', refresh }))
            render(<IotView />)

            const banner = screen.getByRole('alert')
            expect(banner).toHaveTextContent('Refresh failed')
            // The devices are still on screen behind the banner.
            expect(screen.getByRole('button', { name: 'Acme Cameras' })).toBeInTheDocument()

            await userEvent.setup().click(within(banner).getByRole('button', { name: /retry/i }))
            expect(refresh).toHaveBeenCalledOnce()
        })
    })

    describe('search', () => {
        it('filters devices by vendor and shows a filtered empty state on no match', async () => {
            const user = userEvent.setup()
            mockUseIotDevices.mockReturnValue(
                result([device(), device({ mac: 'FFEEDDCCBBAA', name: 'Smart Bulb', vendor: 'Philips' })]),
            )
            render(<IotView />)
            await showTable()

            const box = screen.getByPlaceholderText('Search device, vendor, or IP')

            await user.type(box, 'philips')
            expect(screen.getByText('Smart Bulb')).toBeInTheDocument()
            expect(screen.queryByText('Acme Cameras')).not.toBeInTheDocument()

            await user.clear(box)
            await user.type(box, 'zzz-no-match')
            expect(screen.getByText('No matching devices')).toBeInTheDocument()
        })

        // The placeholder no longer names category/MAC, but both stay searchable.
        it('also matches on category and MAC', async () => {
            const user = userEvent.setup()
            mockUseIotDevices.mockReturnValue(
                result([
                    // "thermostat" appears ONLY in category, "FFEEDDCC" only in mac.
                    device({ name: 'Nest', vendor: 'Google', category: 'thermostat' }),
                    device({ mac: 'FFEEDDCCBBAA', name: 'Smart Bulb', vendor: 'Philips', category: 'bulb' }),
                ]),
            )
            render(<IotView />)
            await showTable()
            const box = screen.getByPlaceholderText('Search device, vendor, or IP')

            await user.type(box, 'thermostat')
            expect(screen.getByText('Nest')).toBeInTheDocument()
            expect(screen.queryByText('Smart Bulb')).not.toBeInTheDocument()

            await user.clear(box)
            await user.type(box, 'FFEEDDCC')
            expect(screen.getByText('Smart Bulb')).toBeInTheDocument()
            expect(screen.queryByText('Nest')).not.toBeInTheDocument()
        })

        it('drops the open panel when its device is filtered away', async () => {
            const user = userEvent.setup()
            mockUseIotDevices.mockReturnValue(
                result([device(), device({ mac: 'FFEEDDCCBBAA', name: 'Smart Bulb', vendor: 'Philips' })]),
            )
            const { container } = render(<IotView />)
            await showTable()

            // "Acme Cameras" is both the name and the vendor; the name cell is the clickable one.
            const nameCell = container.querySelector('.iot-view__cell-name')
            await user.click(nameCell as HTMLElement)
            expect(container.querySelector('.page-panel')).not.toBeNull()

            await user.type(screen.getByPlaceholderText('Search device, vendor, or IP'), 'philips')
            expect(container.querySelector('.page-panel')).toBeNull()
        })
    })

    it('clears the selection when switching modes', async () => {
        const user = userEvent.setup()
        mockUseIotDevices.mockReturnValue(result([device()]))
        const { container } = render(<IotView />)

        await user.click(screen.getByRole('button', { name: 'Acme Cameras' }))
        expect(container.querySelector('.page-panel')).not.toBeNull()

        await user.click(screen.getByRole('button', { name: 'Table' }))
        expect(container.querySelector('.page-panel')).toBeNull()
    })
})
