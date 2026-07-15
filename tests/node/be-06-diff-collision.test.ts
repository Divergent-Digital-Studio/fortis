import { describe, it, expect, beforeEach } from 'vitest'
import { FortisEventBus } from '@main/services/event-bus'
import { DiffEngine } from '@main/utils/diff-engine'
import type { NetworkConnection } from '@shared/types'

function collidingUdp(id: string): NetworkConnection {
    return {
        id,
        protocol: 'udp',
        localAddress: '0.0.0.0',
        localPort: 5353,
        remoteAddress: '0.0.0.0',
        remotePort: 0,
        state: 'ESTABLISHED',
        processName: 'mdns',
        processId: 0,
        timestamp: Date.now(),
    }
}

function distinctTcp(port: number): NetworkConnection {
    return {
        id: `tcp:10.0.0.1:${port}->5.5.5.5:443@10`,
        protocol: 'tcp',
        localAddress: '10.0.0.1',
        localPort: port,
        remoteAddress: '5.5.5.5',
        remotePort: 443,
        state: 'ESTABLISHED',
        processName: 'app',
        processId: 10,
        timestamp: Date.now(),
    }
}

describe('BE-06 diff is count-aware for colliding composite keys', () => {
    let engine: DiffEngine

    beforeEach(() => {
        engine = new DiffEngine(new FortisEventBus())
    })

    it('reports a drop when one of three identical-tuple sockets disappears', () => {
        engine.computeDiff([collidingUdp('a'), collidingUdp('b'), collidingUdp('c')])
        const diff = engine.computeDiff([collidingUdp('a'), collidingUdp('b')])

        expect(diff.droppedConnections.length).toBe(1)
        expect(diff.totalActive).toBe(2)
        expect(diff.newConnections.length).toBe(0)
    })

    it('reports a new connection when an identical-tuple socket is added', () => {
        engine.computeDiff([collidingUdp('a'), collidingUdp('b')])
        const diff = engine.computeDiff([collidingUdp('a'), collidingUdp('b'), collidingUdp('c')])

        expect(diff.newConnections.length).toBe(1)
        expect(diff.droppedConnections.length).toBe(0)
        expect(diff.totalActive).toBe(3)
    })

    it('still counts a single distinct connection exactly once', () => {
        engine.computeDiff([])
        const diff = engine.computeDiff([distinctTcp(6000)])

        expect(diff.newConnections.length).toBe(1)
        expect(diff.droppedConnections.length).toBe(0)
    })

    it('emits one drop and one new when distinct tuples swap one-for-one', () => {
        engine.computeDiff([distinctTcp(6000)])
        const diff = engine.computeDiff([distinctTcp(6001)])

        expect(diff.newConnections.length).toBe(1)
        expect(diff.droppedConnections.length).toBe(1)
    })
})
