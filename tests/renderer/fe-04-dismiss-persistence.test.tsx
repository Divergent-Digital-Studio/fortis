import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAlertStore } from '@renderer/stores/alert-store'
import type { Alert } from '@shared/types/alert'

function alert(id: string): Alert {
    return {
        id,
        timestamp: Date.now(),
        type: 'rule_based',
        threatLevel: 'danger',
        title: `Alert ${id}`,
        description: 'desc',
        source: 'rule_engine',
        acknowledged: false,
        whitelisted: false,
        createdAt: Date.now(),
    } as Alert
}

function installFortisMock(alerts: Alert[]): void {
    ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
        getRecentAlerts: async () => alerts,
        getAlerts: async () => alerts,
        getAlertCounts: async () => ({
            total: alerts.length, critical: 0, danger: alerts.length, warning: 0, info: 0,
            unacknowledged: alerts.length,
        }),
        acknowledgeAlert: async () => true,
        addToWhitelist: async () => 'wl1',
        onNewAlert: () => () => {},
        onAnalysisUpdate: () => () => {},
        getWhitelist: async () => [],
        onWhitelistUpdate: () => () => {},
    }
}

function resetStore(alerts: Alert[]): void {
    useAlertStore.setState({
        alerts,
        dismissedIds: new Set<string>(),
        loading: false,
        error: null,
    })
}

beforeEach(() => {
    installFortisMock([alert('a1'), alert('a2')])
    resetStore([alert('a1'), alert('a2')])
})

describe('FE-04 alert dismissals persist across remount', () => {
    it('dismissAlert in the store records the id', () => {
        useAlertStore.getState().dismissAlert('a1')
        expect(useAlertStore.getState().dismissedIds.has('a1')).toBe(true)
    })

    it('a dismissed alert stays hidden after AlertsView unmounts and remounts', async () => {
        const { default: AlertsView } = await import('@renderer/components/alerts/AlertsView')
        const { unmount } = render(<AlertsView />)

        const dismissButtons = await screen.findAllByRole('button', { name: /Dismiss/i })
        await userEvent.click(dismissButtons[0]!)

        await waitFor(() => {
            expect(screen.queryByText('Alert a1')).not.toBeInTheDocument()
        })
        expect(useAlertStore.getState().dismissedIds.has('a1')).toBe(true)

        unmount()
        render(<AlertsView />)

        await waitFor(() => {
            expect(screen.queryByText('Alert a2')).toBeInTheDocument()
        })
        expect(screen.queryByText('Alert a1')).not.toBeInTheDocument()
    })
})
