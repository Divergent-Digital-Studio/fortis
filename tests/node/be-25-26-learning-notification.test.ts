import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockNotificationShow = vi.fn()
const mockNotificationCtor = vi.fn()

vi.mock('electron', () => {
    class FakeNotification {
        constructor(opts: unknown) {
            mockNotificationCtor(opts)
        }
        on() { return this }
        show() { mockNotificationShow() }
        static isSupported() { return true }
    }
    return {
        Notification: FakeNotification,
        BrowserWindow: { getAllWindows: () => [] },
        app: { dock: { show: () => {} }, emit: () => {} },
    }
})

vi.mock('@main/ipc-handlers', () => ({
    pushLearningStatus: () => {},
    pushNewAlert: () => {},
    updateCachedConnections: () => {},
    pushScanStatusUpdate: () => {},
}))

import { LearningPeriodService } from '@main/services/learning-period'
import { NotificationService } from '@main/services/notification'
import { FortisEventBus } from '@main/services/event-bus'
import { SensitivityTuner } from '@main/services/sensitivity-tuner'
import type { DatabaseService } from '@main/services/database'
import type { Alert } from '@shared/types/alert'

function activeLearningDb(extra: Record<string, unknown> = {}): DatabaseService {
    const start = new Date().toISOString()
    const store: Record<string, unknown> = {
        learningPeriodStart: start,
        learningPeriodComplete: false,
        ...extra,
    }
    return {
        getSetting: (k: string) => store[k],
        setSetting: (k: string, v: unknown) => { store[k] = v },
        saveBaselineEntry: () => {},
        isInBaseline: () => false,
        getBaselineCount: () => 0,
    } as unknown as DatabaseService
}

describe('BE-26 #8 learning shouldSuppressAlert allows danger', () => {
    let service: LearningPeriodService

    beforeEach(() => {
        service = new LearningPeriodService(new FortisEventBus(), activeLearningDb())
    })

    it('does NOT suppress danger during learning', () => {
        expect(service.shouldSuppressAlert('danger')).toBe(false)
    })

    it('does NOT suppress critical during learning', () => {
        expect(service.shouldSuppressAlert('critical')).toBe(false)
    })

    it('suppresses warning/info during learning', () => {
        expect(service.shouldSuppressAlert('warning')).toBe(true)
        expect(service.shouldSuppressAlert('info')).toBe(true)
    })
})

describe('BE-25b learning recordConnections does not throw and warns once on batch failure', () => {
    it('saveBaselineEntry throwing does not propagate; warns once', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const db = activeLearningDb()
        ;(db as unknown as { saveBaselineEntry: () => void }).saveBaselineEntry = () => { throw new Error('disk full') }
        const service = new LearningPeriodService(new FortisEventBus(), db)

        const connections = Array.from({ length: 5 }, (_, i) => ({
            id: `c${i}`, protocol: 'tcp' as const, localAddress: '192.0.2.1', localPort: 1,
            remoteAddress: '93.184.216.5', remotePort: 443, state: 'ESTABLISHED' as const,
            processName: 'proc', processId: 1, timestamp: Date.now(),
        }))

        expect(() => service.recordConnections(connections)).not.toThrow()
        const baselineWarns = warnSpy.mock.calls.filter((c) => String(c[0]).includes('baseline'))
        expect(baselineWarns.length).toBe(1)
        warnSpy.mockRestore()
    })
})

describe('BE-25 free-tier danger raises an OS notification', () => {
    beforeEach(() => {
        mockNotificationShow.mockClear()
        mockNotificationCtor.mockClear()
    })

    function makeAlert(threatLevel: Alert['threatLevel']): Alert {
        return {
            id: 'a1', timestamp: Date.now(), type: 'rule_based', threatLevel,
            title: 'T', description: 'desc', source: 'rule_engine',
            acknowledged: false, whitelisted: false, createdAt: Date.now(),
        } as Alert
    }

    it('free tier danger threat shows a notification', () => {
        const eventBus = new FortisEventBus()
        const db = {
            getSetting: (k: string) => ({ notificationsEnabled: true, tier: 'free', soundEnabled: false } as Record<string, unknown>)[k],
            setSetting: () => {},
        } as unknown as DatabaseService
        const service = new NotificationService(eventBus, db, new SensitivityTuner())
        service.wire()

        eventBus.emit('threat:detected', { alert: makeAlert('danger') })
        expect(mockNotificationShow).toHaveBeenCalledTimes(1)
    })

    it('free tier critical threat shows a notification', () => {
        const eventBus = new FortisEventBus()
        const db = {
            getSetting: (k: string) => ({ notificationsEnabled: true, tier: 'free', soundEnabled: false } as Record<string, unknown>)[k],
            setSetting: () => {},
        } as unknown as DatabaseService
        const service = new NotificationService(eventBus, db, new SensitivityTuner())
        service.wire()

        eventBus.emit('threat:detected', { alert: makeAlert('critical') })
        expect(mockNotificationShow).toHaveBeenCalledTimes(1)
    })

    it('free tier warning threat does NOT show a notification (still gated)', () => {
        const eventBus = new FortisEventBus()
        const db = {
            getSetting: (k: string) => ({ notificationsEnabled: true, tier: 'free', soundEnabled: false } as Record<string, unknown>)[k],
            setSetting: () => {},
        } as unknown as DatabaseService
        const service = new NotificationService(eventBus, db, new SensitivityTuner())
        service.wire()

        eventBus.emit('threat:detected', { alert: makeAlert('warning') })
        expect(mockNotificationShow).not.toHaveBeenCalled()
    })
})

describe('BE-25c notification listener cleanup', () => {
    it('listenerCount is 1 after wire and 0 after dispose; post-dispose emit does not show', () => {
        mockNotificationShow.mockClear()
        const eventBus = new FortisEventBus()
        const db = {
            getSetting: (k: string) => ({ notificationsEnabled: true, tier: 'pro', soundEnabled: false } as Record<string, unknown>)[k],
            setSetting: () => {},
        } as unknown as DatabaseService
        const service = new NotificationService(eventBus, db, new SensitivityTuner())

        service.wire()
        expect(eventBus.listenerCount('threat:detected')).toBe(1)

        service.dispose()
        expect(eventBus.listenerCount('threat:detected')).toBe(0)

        eventBus.emit('threat:detected', {
            alert: { id: 'x', timestamp: Date.now(), type: 'rule_based', threatLevel: 'danger', title: 'T', description: 'd', source: 'rule_engine', acknowledged: false, whitelisted: false, createdAt: Date.now() } as Alert,
        })
        expect(mockNotificationShow).not.toHaveBeenCalled()
    })
})
