import { describe, it, expect, beforeEach } from 'vitest'
import { SmartTriggerService } from '@main/services/smart-trigger'
import { SUSPICIOUS_PORTS, SUSPICIOUS_IP_LIST } from '@main/services/suspicious-indicators'
import { SensitivityTuner } from '@main/services/sensitivity-tuner'
import type { NetworkConnection, ConnectionDiff } from '@shared/types/connection'
import type { FortisEventBus } from '@main/services/event-bus'
import type { IDatabaseService } from '@main/services/database'

function makeConnection(overrides: Partial<NetworkConnection>): NetworkConnection {
    return {
        id: overrides.id ?? 'c1',
        protocol: 'tcp',
        localAddress: '0.0.0.0',
        localPort: 50000,
        remoteAddress: overrides.remoteAddress ?? '93.184.216.34',
        remotePort: overrides.remotePort ?? 443,
        state: 'ESTABLISHED',
        processName: overrides.processName ?? 'unknownproc',
        processId: 1234,
        timestamp: Date.now(),
        ...overrides,
    }
}

function makeDiff(newConnections: NetworkConnection[]): ConnectionDiff {
    return {
        timestamp: Date.now(),
        newConnections,
        droppedConnections: [],
        changedConnections: [],
        totalActive: newConnections.length,
    }
}

function makeFakeDb(tier: string): IDatabaseService {
    const store: Record<string, unknown> = { tier, dailyAiScansUsed: 0, lastScanDate: '' }
    return {
        getSetting: (key: string) => store[key],
        setSetting: (key: string, value: unknown) => {
            store[key] = value
        },
        isWhitelisted: () => false,
    } as unknown as IDatabaseService
}

function makeService(tier = 'pro'): SmartTriggerService {
    const eventBus = { emit: () => {}, on: () => {}, off: () => {} } as unknown as FortisEventBus
    return new SmartTriggerService(eventBus, makeFakeDb(tier), new SensitivityTuner())
}

describe('BE-20 isKnownSafeProcess word-boundary matching', () => {
    let service: SmartTriggerService

    beforeEach(() => {
        service = makeService()
    })

    it('matches exact safe process names', () => {
        expect(service.isKnownSafeProcess('code')).toBe(true)
        expect(service.isKnownSafeProcess('Code.exe')).toBe(true)
        expect(service.isKnownSafeProcess('/usr/bin/code')).toBe(true)
        expect(service.isKnownSafeProcess('Google Chrome Helper (Renderer)')).toBe(true)
    })

    it('does NOT whitelist names that merely contain a safe token', () => {
        expect(service.isKnownSafeProcess('barcode')).toBe(false)
        expect(service.isKnownSafeProcess('operator')).toBe(false)
        expect(service.isKnownSafeProcess('mybird')).toBe(false)
        expect(service.isKnownSafeProcess('mdsx')).toBe(false)
        expect(service.isKnownSafeProcess('teamspy')).toBe(false)
    })

    it('evaluate() flags an unknown process named "barcode" as needing AI', () => {
        const decision = service.evaluate(makeDiff([makeConnection({ processName: 'barcode' })]))
        expect(decision.shouldCall).toBe(true)
        expect(decision.reason).toBe('unknown_process_detected')
    })
})

describe('BE-21 isSuspiciousIP / private-range handling', () => {
    let service: SmartTriggerService

    beforeEach(() => {
        service = makeService()
    })

    it('private LAN address never produces a suspicious_ip reason', () => {
        const decision = service.evaluate(
            makeDiff([makeConnection({ remoteAddress: '10.0.0.5', processName: 'code' })]),
        )
        expect(decision.reason.startsWith('suspicious_ip_')).toBe(false)

        const decision2 = service.evaluate(
            makeDiff([makeConnection({ remoteAddress: '192.168.0.10', processName: 'code' })]),
        )
        expect(decision2.reason.startsWith('suspicious_ip_')).toBe(false)
    })

    it('an IP in SUSPICIOUS_IP_LIST yields critical tier', () => {
        const flaggedService = (() => {
            const eventBus = { emit: () => {}, on: () => {}, off: () => {} } as unknown as FortisEventBus
            const list = new Set(['198.51.100.7'])
            return new SmartTriggerService(eventBus, makeFakeDb('pro'), new SensitivityTuner(), list)
        })()

        const decision = flaggedService.evaluate(
            makeDiff([makeConnection({ remoteAddress: '198.51.100.7', processName: 'code' })]),
        )
        expect(decision.shouldCall).toBe(true)
        expect(decision.modelTier).toBe('critical')
        expect(decision.reason).toBe('suspicious_ip_198.51.100.7')
    })

    it('benign public IP not in list does not produce suspicious_ip reason', () => {
        const decision = service.evaluate(
            makeDiff([makeConnection({ remoteAddress: '93.184.216.34', processName: 'code' })]),
        )
        expect(decision.reason.startsWith('suspicious_ip_')).toBe(false)
    })

    it('SUSPICIOUS_IP_LIST is exported and is a Set', () => {
        expect(SUSPICIOUS_IP_LIST).toBeInstanceOf(Set)
    })
})

describe('BE-24 SUSPICIOUS_PORTS shared & complete', () => {
    let service: SmartTriggerService

    beforeEach(() => {
        service = makeService()
    })

    it('every port in shared SUSPICIOUS_PORTS escalates to critical', () => {
        for (const port of SUSPICIOUS_PORTS) {
            const decision = service.evaluate(
                makeDiff([makeConnection({ remotePort: port, processName: 'code' })]),
            )
            expect(decision.modelTier, `port ${port}`).toBe('critical')
            expect(decision.reason, `port ${port}`).toBe(`suspicious_port_${port}`)
        }
    })

    it('includes the 8 previously-missing ports', () => {
        for (const port of [23, 8333, 4443, 5900, 27374, 1337, 65535, 54321]) {
            expect(SUSPICIOUS_PORTS.has(port), `port ${port}`).toBe(true)
        }
    })
})
