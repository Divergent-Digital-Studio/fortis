import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({
    powerMonitor: {
        isOnBatteryPower: () => false,
        getSystemIdleTime: () => 0,
        on: vi.fn(),
        off: vi.fn(),
    },
}))

import { FortisEventBus } from '@main/services/event-bus'
import { ScanScheduler } from '@main/services/scan-scheduler'

describe('BE-09 scheduler arms next scan only after completion', () => {
    let eventBus: FortisEventBus

    beforeEach(() => {
        vi.useFakeTimers()
        eventBus = new FortisEventBus()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('does not fire a second trigger while a slow scan is still running', () => {
        const scheduler = new ScanScheduler(eventBus, {
            baseInterval: 1000,
            adaptiveEnabled: false,
        })

        let triggerCount = 0
        eventBus.on('scan:trigger', () => {
            triggerCount += 1
        })

        scheduler.start()
        expect(triggerCount).toBe(1)

        vi.advanceTimersByTime(5000)

        expect(triggerCount).toBe(1)

        eventBus.emit('scan:complete', {
            connections: [],
            metadata: { platform: 'darwin', parser: 'lsof', durationMs: 1, connectionCount: 0, diffCount: 0 },
        })

        vi.advanceTimersByTime(1000)
        expect(triggerCount).toBe(2)

        scheduler.stop()
    })

    it('arms the next scan after a scan:error too', () => {
        const scheduler = new ScanScheduler(eventBus, {
            baseInterval: 1000,
            adaptiveEnabled: false,
        })

        let triggerCount = 0
        eventBus.on('scan:trigger', () => {
            triggerCount += 1
        })

        scheduler.start()
        expect(triggerCount).toBe(1)

        vi.advanceTimersByTime(3000)
        expect(triggerCount).toBe(1)

        eventBus.emit('scan:error', { error: new Error('boom'), platform: 'darwin' })

        vi.advanceTimersByTime(1000)
        expect(triggerCount).toBe(2)

        scheduler.stop()
    })
})
