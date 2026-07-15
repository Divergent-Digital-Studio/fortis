import { describe, it, expect, beforeEach } from 'vitest'
import { FortisEventBus } from '@main/services/event-bus'
import { DiffEngine } from '@main/utils/diff-engine'
import type { NetworkConnection } from '@shared/types'

function connA(): NetworkConnection {
    return {
        id: 'tcp:10.0.0.1:7000->9.9.9.9:443@55',
        protocol: 'tcp',
        localAddress: '10.0.0.1',
        localPort: 7000,
        remoteAddress: '9.9.9.9',
        remotePort: 443,
        state: 'ESTABLISHED',
        processName: 'app',
        processId: 55,
        timestamp: Date.now(),
    }
}

describe('BE-11 DiffEngine does not alias caller arrays', () => {
    let engine: DiffEngine

    beforeEach(() => {
        engine = new DiffEngine(new FortisEventBus())
    })

    it('mutating the array returned by getPreviousConnections does not corrupt the next diff', () => {
        engine.computeDiff([connA()])

        const returned = engine.getPreviousConnections()
        returned.push(connA())
        returned.push(connA())

        const diff = engine.computeDiff([connA()])

        expect(diff.newConnections.length).toBe(0)
        expect(diff.droppedConnections.length).toBe(0)
    })

    it('returns a distinct array instance each call', () => {
        engine.computeDiff([connA()])
        const a = engine.getPreviousConnections()
        const b = engine.getPreviousConnections()
        expect(a).not.toBe(b)
    })
})
