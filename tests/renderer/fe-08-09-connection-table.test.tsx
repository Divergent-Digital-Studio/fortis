import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { useConnectionStore } from '@renderer/stores/connection-store'
import type { NetworkConnection } from '@shared/types/connection'
import ConnectionTable from '@renderer/components/connections/ConnectionTable'

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

function installFortisMock(): void {
    ;(window as unknown as { fortis: Record<string, unknown> }).fortis = {
        addToWhitelist: async () => 'wl1',
    }
}

beforeEach(() => {
    installFortisMock()
    useConnectionStore.getState().clearConnections()
})

const baseProps = {
    isLoading: false,
    protocolFilter: 'all' as const,
    stateFilter: 'all' as const,
    searchText: '',
}

describe('FE-08 ConnectionTable rows keyed by stable id survive an index shift', () => {
    it('keeps the same row DOM node for an id when its sorted index changes', () => {
        const initial = [conn('id-b', 'bravo', 200), conn('id-c', 'charlie', 300)]
        const { container, rerender } = render(
            <ConnectionTable {...baseProps} connections={initial} searchText="" />,
        )

        const bravoRowBefore = Array.from(container.querySelectorAll('.connection-row')).find(
            (r) => r.textContent?.includes('bravo'),
        )
        expect(bravoRowBefore).toBeTruthy()

        const withAlpha = [
            conn('id-a', 'alpha', 100),
            conn('id-b', 'bravo', 200),
            conn('id-c', 'charlie', 300),
        ]
        rerender(<ConnectionTable {...baseProps} connections={withAlpha} searchText="" />)

        const bravoRowAfter = Array.from(container.querySelectorAll('.connection-row')).find(
            (r) => r.textContent?.includes('bravo'),
        )
        expect(bravoRowAfter).toBe(bravoRowBefore)
    })
})

describe('FE-09 ConnectionTable advances the new-connection baseline', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('settles the new flag after the TTL and does not re-flag on later renders', () => {
        const ab = [conn('id-a', 'alpha', 100), conn('id-b', 'bravo', 200)]
        const { container, rerender } = render(
            <ConnectionTable {...baseProps} connections={ab} searchText="" />,
        )

        const ac = [conn('id-a', 'alpha', 100), conn('id-c', 'charlie', 300)]
        rerender(<ConnectionTable {...baseProps} connections={ac} searchText="" />)

        let charlieRow = Array.from(container.querySelectorAll('.connection-row')).find((r) =>
            r.textContent?.includes('charlie'),
        )
        expect(charlieRow?.classList.contains('connection-row--new')).toBe(true)

        act(() => {
            vi.advanceTimersByTime(6000)
        })

        rerender(<ConnectionTable {...baseProps} connections={ac.slice()} searchText="" />)

        charlieRow = Array.from(container.querySelectorAll('.connection-row')).find((r) =>
            r.textContent?.includes('charlie'),
        )
        expect(charlieRow?.classList.contains('connection-row--new')).toBe(false)
    })
})
