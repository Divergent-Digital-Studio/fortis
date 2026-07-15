import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
    BrowserWindow: { getAllWindows: () => [] },
}))

vi.mock('@main/tray', () => ({
    updateTrayState: () => {},
    updateConnectionCount: () => {},
}))

vi.mock('@main/ipc-handlers', () => ({
    updateCachedConnections: () => {},
    pushScanStatusUpdate: () => {},
    pushNewAlert: () => {},
}))

import { EventPipeline } from '@main/services/event-pipeline'
import { FortisEventBus } from '@main/services/event-bus'
import { SensitivityTuner } from '@main/services/sensitivity-tuner'
import type { DatabaseService } from '@main/services/database'
import type { NetworkConnection } from '@shared/types/connection'

function fakeDb(): DatabaseService {
    return {
        saveScanMetadata: () => 'm',
        saveSnapshot: () => 's',
        saveAlert: () => 'a',
        compact: () => {},
        saveBatchDiffs: () => [],
    } as unknown as DatabaseService
}

function makePipeline() {
    const eventBus = new FortisEventBus()
    const pipeline = new EventPipeline({
        eventBus,
        monitor: {} as never,
        scheduler: { setBaseInterval: () => {}, setAdaptiveEnabled: () => {} } as never,
        database: fakeDb(),
        sensitivityTuner: new SensitivityTuner(),
    })
    pipeline.wire()
    return { eventBus, pipeline }
}

const conns: NetworkConnection[] = [
    { id: 'c1', protocol: 'tcp', localAddress: '192.0.2.1', localPort: 1, remoteAddress: '93.184.216.1', remotePort: 443, state: 'ESTABLISHED', processName: 'p', processId: 1, timestamp: Date.now() },
]

describe('BE-25a runThreatDetection does not swallow errors', () => {
    it('a thrown evaluateAll error is logged (not silently swallowed)', () => {
        const { eventBus, pipeline } = makePipeline()
        const detector = (pipeline as unknown as { threatDetector: { evaluateAll: () => never } }).threatDetector
        detector.evaluateAll = () => { throw new Error('detector blew up') }

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        expect(() => {
            eventBus.emit('scan:complete', {
                connections: conns,
                metadata: { platform: 'macOS', parser: 'lsof', durationMs: 1, connectionCount: 1, diffCount: 0 },
            })
        }).not.toThrow()

        const logged = errorSpy.mock.calls.some((c) => String(c.join(' ')).toLowerCase().includes('detection'))
        expect(logged).toBe(true)
        errorSpy.mockRestore()
    })

    it('one bad result does not abort the whole batch', () => {
        const { eventBus, pipeline } = makePipeline()
        const handled: string[] = []
        const pAny = pipeline as unknown as {
            threatDetector: { evaluateAll: () => unknown[] }
            confidenceScorer: { filterBatch: (r: unknown[]) => { alerts: unknown[]; silentLogs: unknown[]; suppressed: unknown[] } }
            handleThreatResult: (r: { id: string }) => void
        }
        pAny.threatDetector.evaluateAll = () => [{ id: 'bad' }, { id: 'good' }]
        pAny.confidenceScorer.filterBatch = (r) => ({ alerts: r as { id: string }[], silentLogs: [], suppressed: [] })
        const original = pAny.handleThreatResult.bind(pipeline)
        pAny.handleThreatResult = (r: { id: string }) => {
            if (r.id === 'bad') throw new Error('bad result')
            handled.push(r.id)
            void original
        }

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        eventBus.emit('scan:complete', {
            connections: conns,
            metadata: { platform: 'macOS', parser: 'lsof', durationMs: 1, connectionCount: 1, diffCount: 0 },
        })
        errorSpy.mockRestore()

        expect(handled).toContain('good')
    })
})
