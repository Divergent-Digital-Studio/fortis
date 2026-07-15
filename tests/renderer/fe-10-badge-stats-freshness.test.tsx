import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useAlertStore } from '@renderer/stores/alert-store'
import { useConnectionStore } from '@renderer/stores/connection-store'
import type { AlertCounts } from '@shared/types/alert'

function counts(unack: number): AlertCounts {
    return { total: unack, critical: 0, danger: unack, warning: 0, info: 0, unacknowledged: unack }
}

let newAlertCb: ((a: unknown) => void) | null = null

function installFortisMock(unack: number): void {
    newAlertCb = null
    ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
        getAlertCounts: async () => counts(unack),
        getConnectionStats: async () => ({
            totalActive: 0, totalTcp: 0, totalUdp: 0, totalEstablished: 0, totalListening: 0,
            uniqueRemoteAddresses: 0, uniqueProcesses: 0, topProcesses: [], topRemoteAddresses: [],
        }),
        getAlerts: async () => [],
        onNewAlert: (cb: (a: unknown) => void) => {
            newAlertCb = cb
            return () => { newAlertCb = null }
        },
        onAnalysisUpdate: () => () => {},
        getDevices: async () => [],
        onDevicesUpdate: () => () => {},
        getDnsQueries: async () => [],
        onDnsUpdate: () => () => {},
        getGeoConnections: async () => [],
        onGeoUpdate: () => () => {},
        getIotDevices: async () => [],
        onIotUpdate: () => () => {},
    }
}

beforeEach(() => {
    useAlertStore.setState({ alertCounts: counts(0), alerts: [], dismissedIds: new Set() })
    useConnectionStore.getState().clearConnections()
})

describe('FE-10 alert-store global initializer keeps badge counts fresh on cold launch', () => {
    it('initAlertSubscriptions fetches counts independent of the Alerts view', async () => {
        installFortisMock(3)
        const cleanup = useAlertStore.getState().initAlertSubscriptions()
        await waitFor(() => {
            expect(useAlertStore.getState().alertCounts.unacknowledged).toBe(3)
        })
        cleanup()
    })

    it('a new alert event prepends and bumps the unacknowledged count', async () => {
        installFortisMock(0)
        const cleanup = useAlertStore.getState().initAlertSubscriptions()
        expect(newAlertCb).toBeTypeOf('function')

        newAlertCb!({
            id: 'x1', timestamp: Date.now(), type: 'rule_based', threatLevel: 'danger',
            title: 'T', description: 'd', source: 'rule_engine', acknowledged: false,
            whitelisted: false, createdAt: Date.now(),
        })

        await waitFor(() => {
            expect(useAlertStore.getState().alertCounts.unacknowledged).toBe(1)
        })
        cleanup()
    })
})

describe('FE-10 StatsRow flagged count derives from the alert store', () => {
    it('renders the unacknowledged count from alertCounts without its own poll', async () => {
        installFortisMock(0)
        useAlertStore.setState({ alertCounts: counts(4) })
        const { default: StatsRow } = await import('@renderer/components/dashboard/StatsRow')
        render(<StatsRow />)
        await waitFor(() => {
            const flagged = screen.getByText('Flagged Connections').closest('.stat-card')
            expect(flagged?.textContent).toContain('4')
        })
    })
})
