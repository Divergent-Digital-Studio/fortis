import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useUIStore } from '@renderer/stores/ui-store'
import type { Alert } from '@shared/types/alert'

const onNavigateTo = vi.fn(() => () => {})

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
    onNavigateTo.mockClear()
    ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
        getAlerts: async () => alerts,
        onNewAlert: () => () => {},
        onAnalysisUpdate: () => () => {},
        onNavigateTo,
    }
}

beforeEach(() => {
    useUIStore.getState().setActiveView('overview')
})

describe('FE-01 RecentAlertsList View All navigates to alerts', () => {
    it('navigates via the ui-store and does not register a no-op onNavigateTo listener', async () => {
        installFortisMock([alert('a1'), alert('a2')])
        const { default: RecentAlertsList } = await import(
            '@renderer/components/dashboard/RecentAlertsList'
        )
        render(<RecentAlertsList />)

        const button = await screen.findByRole('button', { name: /View All/i })
        await userEvent.click(button)

        await waitFor(() => {
            expect(useUIStore.getState().activeView).toBe('alerts')
        })
        expect(onNavigateTo).not.toHaveBeenCalled()
    })
})
