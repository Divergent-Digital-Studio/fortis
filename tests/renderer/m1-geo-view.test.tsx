import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GeoConnection } from '@shared/types/m1'
import type { UseGeoConnectionsResult } from '@renderer/hooks/useGeoConnections'

const mockUseGeoConnections = vi.fn<() => UseGeoConnectionsResult>()
vi.mock('@renderer/hooks/useGeoConnections', () => ({
    default: () => mockUseGeoConnections(),
}))

import GeoMapView from '@renderer/components/geo/GeoMapView'

function connection(overrides: Partial<GeoConnection> = {}): GeoConnection {
    return {
        remoteAddress: '8.8.8.8',
        countryCode: 'US',
        countryName: 'United States',
        city: 'Wichita',
        latitude: 37.751,
        longitude: -97.822,
        connectionCount: 4,
        ...overrides,
    }
}

function result(connections: GeoConnection[]): UseGeoConnectionsResult {
    return { connections, isLoading: false, error: null, refresh: vi.fn() }
}

beforeEach(() => {
    mockUseGeoConnections.mockReset()
})

describe('GeoMapView', () => {
    it('renders an aggregated country with its connection count', () => {
        mockUseGeoConnections.mockReturnValue(result([connection()]))
        render(<GeoMapView />)
        expect(screen.getByText('United States')).toBeInTheDocument()
        expect(screen.getByText('4')).toBeInTheDocument()
    })

    it('plots a circle for a geolocatable connection', () => {
        mockUseGeoConnections.mockReturnValue(result([connection()]))
        const { container } = render(<GeoMapView />)
        expect(container.querySelector('.geo-map-view__point')).not.toBeNull()
    })

    it('collapses addresses sharing a location into one marker summing their connections', () => {
        mockUseGeoConnections.mockReturnValue(
            result([
                connection({ remoteAddress: '8.8.8.8', connectionCount: 4 }),
                connection({ remoteAddress: '1.1.1.1', connectionCount: 6 }),
                connection({
                    remoteAddress: '5.5.5.5',
                    countryCode: 'DE',
                    countryName: 'Germany',
                    city: 'Frankfurt',
                    latitude: 51.17,
                    longitude: 10.45,
                    connectionCount: 2,
                }),
            ])
        )
        const { container } = render(<GeoMapView />)
        const markers = container.querySelectorAll('.geo-map-view__point')
        expect(markers).toHaveLength(2)
        const labels = Array.from(markers).map((node) => node.getAttribute('aria-label'))
        expect(labels).toContain('Wichita, United States, 10 connections')
        expect(labels).toContain('Frankfurt, Germany, 2 connections')
    })

    it('keeps two cities in one country as separate markers', () => {
        mockUseGeoConnections.mockReturnValue(
            result([
                connection({
                    remoteAddress: '18.155.88.91',
                    countryCode: 'AU',
                    countryName: 'Australia',
                    city: 'Melbourne',
                    latitude: -37.8,
                    longitude: 145,
                    connectionCount: 3,
                }),
                connection({
                    remoteAddress: '54.79.215.244',
                    countryCode: 'AU',
                    countryName: 'Australia',
                    city: 'Sydney',
                    latitude: -33.9,
                    longitude: 151.2,
                    connectionCount: 1,
                }),
            ])
        )
        const { container } = render(<GeoMapView />)
        expect(container.querySelectorAll('.geo-map-view__point')).toHaveLength(2)
        /* One country row, both cities' connections summed into it. */
        expect(screen.getByText('Australia')).toBeInTheDocument()
        expect(screen.getByText('4')).toBeInTheDocument()
    })

    it('plots IPv6 peers and merges them with IPv4 peers at the same location', () => {
        mockUseGeoConnections.mockReturnValue(
            result([
                connection({
                    remoteAddress: '18.64.50.122',
                    countryCode: 'AU',
                    countryName: 'Australia',
                    city: 'Melbourne',
                    latitude: -37.8,
                    longitude: 145,
                    connectionCount: 2,
                }),
                connection({
                    remoteAddress: '2404:6800:4013:407::5f',
                    countryCode: 'AU',
                    countryName: 'Australia',
                    city: 'Melbourne',
                    latitude: -37.8,
                    longitude: 145,
                    connectionCount: 3,
                }),
                connection({
                    remoteAddress: '2a02:6b8::1:119',
                    countryCode: 'RU',
                    countryName: 'Russia',
                    city: 'Moscow',
                    latitude: 55.8,
                    longitude: 37.6,
                    connectionCount: 1,
                }),
            ])
        )
        const { container } = render(<GeoMapView />)
        const markers = container.querySelectorAll('.geo-map-view__point')
        expect(markers).toHaveLength(2)
        const labels = Array.from(markers).map((node) => node.getAttribute('aria-label'))
        expect(labels).toContain('Melbourne, Australia, 5 connections')
        expect(labels).toContain('Moscow, Russia, 1 connection')
    })

    it('opens a popup on hover listing the addresses at that location', async () => {
        const user = userEvent.setup()
        mockUseGeoConnections.mockReturnValue(
            result([
                connection({ remoteAddress: '8.8.8.8', connectionCount: 4 }),
                connection({ remoteAddress: '2404:6800:4013:407::5f', connectionCount: 6 }),
            ])
        )
        const { container } = render(<GeoMapView />)
        expect(screen.queryByRole('tooltip')).toBeNull()

        const marker = container.querySelector('.geo-map-view__point')
        expect(marker).not.toBeNull()
        await user.hover(marker!)

        const tooltip = await screen.findByRole('tooltip')
        expect(tooltip).toHaveTextContent('Wichita, United States')
        expect(tooltip).toHaveTextContent('8.8.8.8')
        expect(tooltip).toHaveTextContent('2404:6800:4013:407::5f')
        expect(tooltip).toHaveTextContent('37.75, -97.82')
    })

    it('does not open the popup while panning across a marker', async () => {
        mockUseGeoConnections.mockReturnValue(result([connection()]))
        const { container } = render(<GeoMapView />)
        const marker = container.querySelector<SVGCircleElement>('.geo-map-view__point')!

        /* jsdom drops `buttons` from fireEvent's init object, and has no PointerEvent;
           a MouseEvent carries `buttons` through its own init. */
        const pointer = (type: string, buttons: number) =>
            fireEvent(
                marker,
                new MouseEvent(type, { bubbles: true, buttons, clientX: 12, clientY: 12 })
            )

        /* buttons=1 means a drag is in progress: that is a pan, not a hover.
           React synthesises onPointerEnter from a native pointerover. */
        pointer('pointerover', 1)
        expect(screen.queryByRole('tooltip')).toBeNull()

        pointer('pointermove', 1)
        expect(screen.queryByRole('tooltip')).toBeNull()

        /* Releasing the drag and moving again over the same marker does open it. */
        pointer('pointermove', 0)
        expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    })

    it('opens the popup on keyboard focus and closes it on blur', async () => {
        mockUseGeoConnections.mockReturnValue(result([connection()]))
        const { container } = render(<GeoMapView />)
        const marker = container.querySelector<SVGCircleElement>('.geo-map-view__point')!

        fireEvent.focus(marker)
        expect(await screen.findByRole('tooltip')).toBeInTheDocument()

        fireEvent.blur(marker)
        await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
    })

    it('keeps a country without coordinates off the map but in the list', () => {
        mockUseGeoConnections.mockReturnValue(
            result([connection({ latitude: null, longitude: null })])
        )
        const { container } = render(<GeoMapView />)
        expect(container.querySelector('.geo-map-view__point')).toBeNull()
        expect(screen.getByText('No locations to plot')).toBeInTheDocument()
    })

    it('shows an empty state when there are no connections', () => {
        mockUseGeoConnections.mockReturnValue(result([]))
        render(<GeoMapView />)
        expect(screen.getByText('No geolocatable connections')).toBeInTheDocument()
    })

    it('shows a loading empty state while the first fetch is in flight', () => {
        mockUseGeoConnections.mockReturnValue({ ...result([]), isLoading: true })
        render(<GeoMapView />)
        expect(screen.getByText('Locating connections…')).toBeInTheDocument()
    })

    it('shows a full error state with retry when the fetch fails with no data', () => {
        const refresh = vi.fn()
        mockUseGeoConnections.mockReturnValue({
            connections: [],
            isLoading: false,
            error: 'geo lookup failed',
            refresh,
        })
        render(<GeoMapView />)
        expect(screen.getByText('Failed to load geolocated connections')).toBeInTheDocument()
        expect(screen.getByText('geo lookup failed')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
        expect(refresh).toHaveBeenCalled()
    })

    it('keeps stale data visible behind an error banner when a refresh fails', () => {
        mockUseGeoConnections.mockReturnValue({
            ...result([connection()]),
            error: 'geo lookup failed',
        })
        render(<GeoMapView />)
        expect(screen.getByRole('alert')).toHaveTextContent('geo lookup failed')
        expect(screen.getByText('United States')).toBeInTheDocument()
    })
})
