import { describe, it, expect } from 'vitest'
import { ThreatDetector } from '@main/services/threat-detector'
import type { NetworkConnection, ConnectionState } from '@shared/types/connection'

function conn(overrides: Partial<NetworkConnection>): NetworkConnection {
    return {
        id: overrides.id ?? `c-${Math.random()}`,
        protocol: 'tcp',
        localAddress: '0.0.0.0',
        localPort: overrides.localPort ?? 50000,
        remoteAddress: overrides.remoteAddress ?? '93.184.216.34',
        remotePort: overrides.remotePort ?? 443,
        state: overrides.state ?? 'ESTABLISHED',
        processName: overrides.processName ?? 'someproc',
        processId: 100,
        timestamp: Date.now(),
        ...overrides,
    }
}

function build(n: number, factory: (i: number) => Partial<NetworkConnection>): NetworkConnection[] {
    return Array.from({ length: n }, (_, i) => conn({ id: `id-${i}`, ...factory(i) }))
}

describe('BE-18 brute-force does not count ESTABLISHED', () => {
    it('12 ESTABLISHED sockets to one external IP produce no brute-force result', () => {
        const detector = new ThreatDetector()
        const connections = build(12, () => ({
            remoteAddress: '203.0.113.9',
            state: 'ESTABLISHED' as ConnectionState,
            processName: 'pgpool',
        }))
        const results = detector.evaluateAll(connections)
        expect(results.some((r) => r.ruleId === 'brute-force')).toBe(false)
    })

    it('12 SYN_SENT to one IP produce exactly one brute-force warning', () => {
        const detector = new ThreatDetector()
        const connections = build(12, () => ({
            remoteAddress: '203.0.113.9',
            state: 'SYN_SENT' as ConnectionState,
            processName: 'scanner',
        }))
        const results = detector.evaluateAll(connections)
        const bf = results.filter((r) => r.ruleId === 'brute-force')
        expect(bf.length).toBe(1)
        expect(bf[0]!.threatLevel).toBe('warning')
    })
})

describe('BE-19 rapid-churn does not fire on first scan', () => {
    it('first evaluateAll with 60 connections produces no rapid-churn', () => {
        const detector = new ThreatDetector()
        const connections = build(60, (i) => ({ remoteAddress: `203.0.113.${i % 250}` }))
        const results = detector.evaluateAll(connections)
        expect(results.some((r) => r.ruleId === 'rapid-churn')).toBe(false)
    })

    it('after a low baseline a large subsequent scan fires rapid-churn', () => {
        const detector = new ThreatDetector()
        detector.evaluateAll(build(2, (i) => ({ remoteAddress: `198.51.100.${i}` })))
        const results = detector.evaluateAll(build(60, (i) => ({ remoteAddress: `203.0.113.${i % 250}` })))
        expect(results.some((r) => r.ruleId === 'rapid-churn')).toBe(true)
    })
})

describe('BE-17 data-exfiltration fan-out semantics', () => {
    it('55 zero-byte CDN sockets do NOT produce a DATA_EXFILTRATION danger', () => {
        const detector = new ThreatDetector()
        detector.evaluateAll([conn({ id: 'seed' })])
        const connections = build(55, () => ({
            remoteAddress: '151.101.1.69',
            processName: 'browser',
            state: 'ESTABLISHED' as ConnectionState,
        }))
        const results = detector.evaluateAll(connections)
        const exfil = results.filter((r) => r.ruleId === 'data-exfiltration')
        expect(exfil.every((r) => r.threatLevel !== 'danger')).toBe(true)
    })

    it('data-exfiltration rule name reflects fan-out and lower confidence', () => {
        const detector = new ThreatDetector()
        const rule = detector.getRules().find((r) => r.id === 'data-exfiltration')
        expect(rule).toBeDefined()
        expect(rule!.name.toLowerCase()).toContain('fan-out')
    })
})

describe('BE-16 dns-tunneling escalates to danger on high count', () => {
    it('DNS tunneling above warning threshold returns danger', () => {
        const detector = new ThreatDetector()
        const connections = build(60, (i) => ({
            id: `dns-${i}`,
            remoteAddress: '203.0.113.50',
            remotePort: 53,
            processName: 'tunnel',
            state: 'ESTABLISHED' as ConnectionState,
        }))
        const results = detector.evaluateAll(connections)
        const dns = results.filter((r) => r.ruleId === 'dns-tunneling')
        expect(dns.length).toBeGreaterThan(0)
        expect(dns.some((r) => r.threatLevel === 'danger')).toBe(true)
    })
})
