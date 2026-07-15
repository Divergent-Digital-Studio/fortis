import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useConnectionStore } from '@renderer/stores/connection-store'
import type { NetworkConnection } from '@shared/types/connection'
import ConnectionsView from '@renderer/components/connections/ConnectionsView'
import ConnectionRow from '@renderer/components/connections/ConnectionRow'

function conn(id: string, processName: string, port: number): NetworkConnection {
    return {
        id,
        protocol: 'tcp',
        localAddress: '192.0.2.1',
        localPort: 1000,
        remoteAddress: '93.184.216.5',
        remotePort: port,
        state: 'ESTABLISHED',
        processName,
        processId: 1,
        timestamp: Date.now(),
    }
}

function installFortisMock(overrides: Record<string, unknown> = {}): void {
    ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
        getConnections: async () => [conn('id-a', 'alpha', 100)],
        addToWhitelist: async () => 'wl1',
        ...overrides,
    }
}

beforeEach(() => {
    localStorage.setItem('fortis.viewMode.connections', 'table')
    useConnectionStore.getState().clearConnections()
})

afterEach(() => {
    localStorage.clear()
})

describe('ConnectionsView surfaces whitelist action failures', () => {
    it('shows a dismissible role=alert banner with the stripped IPC error', async () => {
        installFortisMock({
            addToWhitelist: async () => {
                throw new Error(
                    "Error invoking remote method 'whitelist:add': Error: FORBIDDEN: viewer role cannot modify whitelist",
                )
            },
        })

        render(<ConnectionsView />)

        const row = await screen.findByText('alpha')
        fireEvent.contextMenu(row.closest('.connection-row') as Element)
        fireEvent.click(screen.getByText('Mark as Safe'))

        const banner = await screen.findByRole('alert')
        expect(banner.textContent).toContain('FORBIDDEN: viewer role cannot modify whitelist')
        expect(banner.textContent).not.toContain('Error invoking remote method')

        fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
        await waitFor(() => {
            expect(screen.queryByRole('alert')).toBeNull()
        })
    })

    it('shows no banner when the whitelist add succeeds', async () => {
        installFortisMock()

        render(<ConnectionsView />)

        const row = await screen.findByText('alpha')
        fireEvent.contextMenu(row.closest('.connection-row') as Element)
        fireEvent.click(screen.getByText('Mark as Safe'))

        await waitFor(() => {
            expect(screen.queryByRole('alert')).toBeNull()
        })
    })
})

describe('ConnectionRow tooltip duration ticks while open', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('advances the connected duration once per second', () => {
        const connection = conn('id-t', 'ticker', 443)
        const { container } = render(
            <ConnectionRow connection={connection} isNew={false} />,
        )

        fireEvent.mouseEnter(container.querySelector('.connection-row') as Element)
        expect(container.textContent).toContain('Connected 0s')

        act(() => {
            vi.advanceTimersByTime(3000)
        })
        expect(container.textContent).toContain('Connected 3s')
    })
})
