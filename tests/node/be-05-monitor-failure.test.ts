import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FortisEventBus } from '@main/services/event-bus'
import { NetworkMonitor } from '@main/services/network-monitor'
import type { IConnectionParser } from '@main/utils/parsers/parser.interface'
import type { ScanScheduler } from '@main/services/scan-scheduler'
import type { NetworkConnection } from '@shared/types'

function makeConnection(port: number): NetworkConnection {
    return {
        id: `tcp:10.0.0.1:${port}->1.2.3.4:443@100`,
        protocol: 'tcp',
        localAddress: '10.0.0.1',
        localPort: port,
        remoteAddress: '1.2.3.4',
        remotePort: 443,
        state: 'ESTABLISHED',
        processName: 'proc',
        processId: 100,
        timestamp: Date.now(),
    }
}

function stubScheduler(): ScanScheduler {
    return {
        start: vi.fn(),
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
    } as unknown as ScanScheduler
}

describe('BE-05 monitor distinguishes command failure from zero connections', () => {
    let eventBus: FortisEventBus

    beforeEach(() => {
        eventBus = new FortisEventBus()
    })

    it('on parse failure emits scan:error, no scan:complete, keeps previous connections', async () => {
        const conns = [makeConnection(5000), makeConnection(5001)]
        let call = 0
        const parser: IConnectionParser = {
            getPlatform: () => 'darwin',
            parse: vi.fn(async () => {
                call += 1
                if (call === 1) return conns
                throw new Error('command timed out')
            }),
        }

        const monitor = new NetworkMonitor(eventBus, stubScheduler(), parser)

        const completeEvents: unknown[] = []
        const errorEvents: unknown[] = []
        eventBus.on('scan:complete', (p) => completeEvents.push(p))
        eventBus.on('scan:error', (p) => errorEvents.push(p))

        const first = await monitor.triggerManualScan()
        expect(first).not.toBeNull()
        expect(monitor.getPreviousConnections()).toHaveLength(2)

        completeEvents.length = 0

        const second = await monitor.triggerManualScan()

        expect(second).toBeNull()
        expect(completeEvents).toHaveLength(0)
        expect(errorEvents).toHaveLength(1)
        expect(monitor.getStatus()).toBe('error')
        expect(monitor.getPreviousConnections()).toHaveLength(2)
    })
})
