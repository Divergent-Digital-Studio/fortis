import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FortisEventBus } from '@main/services/event-bus'
import { NetworkMonitor } from '@main/services/network-monitor'
import type { IConnectionParser } from '@main/utils/parsers/parser.interface'
import type { ScanScheduler } from '@main/services/scan-scheduler'

function stubScheduler(): ScanScheduler {
    return {
        start: vi.fn(),
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
    } as unknown as ScanScheduler
}

function noopParser(): IConnectionParser {
    return {
        getPlatform: () => 'darwin',
        parse: vi.fn(async () => []),
    }
}

describe('BE-10 NetworkMonitor scan:trigger registration is idempotent', () => {
    let eventBus: FortisEventBus

    beforeEach(() => {
        eventBus = new FortisEventBus()
    })

    it('keeps exactly one scan:trigger listener across start/stop/start/start', () => {
        const monitor = new NetworkMonitor(eventBus, stubScheduler(), noopParser())

        monitor.start()
        monitor.stop()
        monitor.start()
        monitor.start()

        expect(eventBus.listenerCount('scan:trigger')).toBe(1)

        monitor.stop()
        expect(eventBus.listenerCount('scan:trigger')).toBe(0)
    })

    it('does not duplicate the listener when restarted from error state', () => {
        const monitor = new NetworkMonitor(eventBus, stubScheduler(), noopParser())

        monitor.start()
        ;(monitor as unknown as { status: string }).status = 'error'
        monitor.start()

        expect(eventBus.listenerCount('scan:trigger')).toBe(1)
    })
})
