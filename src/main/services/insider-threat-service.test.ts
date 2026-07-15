import { describe, it, expect, vi } from 'vitest'
import { InsiderThreatService } from './insider-threat-service'
import { FortisEventBus } from './event-bus'
import type { BandwidthSnapshot } from '../../shared/types/m3'
import type { NetworkConnection } from '../../shared/types/connection'
import type { Alert } from '../../shared/types/alert'

function makeConnection(processName: string, remoteAddress: string): NetworkConnection {
    return {
        id: `${processName}-${remoteAddress}`,
        protocol: 'tcp',
        localAddress: '192.168.1.2',
        localPort: 50000,
        remoteAddress,
        remotePort: 443,
        state: 'ESTABLISHED',
        processName,
        pid: 100,
    } as unknown as NetworkConnection
}

function makeSnapshot(processName: string, bytesOutPerSec: number): BandwidthSnapshot {
    return {
        status: 'ready',
        sampledAt: Date.now(),
        processes: [{ pid: 100, processName, bytesInPerSec: 0, bytesOutPerSec }],
    }
}

function makeDbs() {
    const knownDests = new Map<string, Set<string>>()
    return {
        getSetting: vi.fn(() => true),
        listInsiderDestinations: vi.fn((name: string) => [...(knownDests.get(name) ?? [])]),
        upsertInsiderBaseline: vi.fn((name: string, dest: string) => {
            const s = knownDests.get(name) ?? new Set<string>()
            s.add(dest)
            knownDests.set(name, s)
        }),
    }
}

describe('InsiderThreatService data-egress wiring', () => {
    it('keeps the egress factor disabled when no bandwidth samples exist', () => {
        const bus = new FortisEventBus()
        const dbs = makeDbs()
        const alerts: Alert[] = []
        const svc = new InsiderThreatService({
            database: dbs as never,
            eventBus: bus,
            onAlert: (a) => alerts.push(a),
            now: () => 1000,
        })
        svc.start()

        bus.emit('scan:complete', {
            connections: [makeConnection('curl', '9.9.9.9')],
            metadata: { platform: 'darwin', parser: 'mac', durationMs: 1, connectionCount: 1, diffCount: 0 },
        })

        expect(alerts.length).toBe(0)
        svc.stop()
    })

    it('raises an alert when egress spikes above the rolling baseline', () => {
        const bus = new FortisEventBus()
        const dbs = makeDbs()
        const alerts: Alert[] = []
        const offHoursTs = new Date()
        offHoursTs.setHours(3, 0, 0, 0)
        const svc = new InsiderThreatService({
            database: dbs as never,
            eventBus: bus,
            onAlert: (a) => alerts.push(a),
            now: () => offHoursTs.getTime(),
        })
        svc.start()

        for (let i = 0; i < 4; i++) {
            bus.emit('bandwidth:updated', { snapshot: makeSnapshot('curl', 1000) })
        }
        const known = new Set<string>(['1.1.1.1'])
        dbs.listInsiderDestinations.mockImplementation(() => [...known])

        bus.emit('bandwidth:updated', { snapshot: makeSnapshot('curl', 50000) })
        bus.emit('scan:complete', {
            connections: [makeConnection('curl', '9.9.9.9')],
            metadata: { platform: 'darwin', parser: 'mac', durationMs: 1, connectionCount: 1, diffCount: 0 },
        })
        expect(alerts.length).toBeGreaterThan(0)
        expect(alerts[0]!.title).toContain('curl')
        expect(alerts[0]!.description).toContain('data-egress spike')
        svc.stop()
    })

    it('ignores bandwidth snapshots that are not ready', () => {
        const bus = new FortisEventBus()
        const dbs = makeDbs()
        const svc = new InsiderThreatService({
            database: dbs as never,
            eventBus: bus,
            onAlert: () => {},
            now: () => 0,
        })
        svc.start()
        bus.emit('bandwidth:updated', { snapshot: { status: 'unsupported', sampledAt: 0, processes: [] } })
        expect((svc as unknown as { egressByProcess: Map<string, number[]> }).egressByProcess.size).toBe(0)
        svc.stop()
    })

    it('caps the number of tracked processes to bound memory', () => {
        const bus = new FortisEventBus()
        const dbs = makeDbs()
        const svc = new InsiderThreatService({
            database: dbs as never,
            eventBus: bus,
            onAlert: () => {},
            now: () => 0,
        })
        svc.start()
        const cap = 256
        for (let i = 0; i < cap + 50; i++) {
            bus.emit('bandwidth:updated', {
                snapshot: makeSnapshot(`proc-${i}`, 500),
            })
        }
        const map = (svc as unknown as { egressByProcess: Map<string, number[]> }).egressByProcess
        expect(map.size).toBe(cap)
        expect(map.has('proc-0')).toBe(false)
        expect(map.has(`proc-${cap + 49}`)).toBe(true)
        svc.stop()
    })
})
