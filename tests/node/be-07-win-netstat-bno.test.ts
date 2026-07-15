import { describe, it, expect } from 'vitest'
import { parseNetstatOutput } from '@main/utils/parsers/win-parser'

const NETSTAT_BNO_FIXTURE = [
    'Active Connections',
    '',
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    192.168.1.5:51000      140.82.113.25:443      ESTABLISHED     4321',
    ' [chrome.exe]',
    '  TCP    192.168.1.5:51001      52.96.0.1:443          ESTABLISHED     916',
    ' RpcSs',
    ' [svchost.exe]',
    '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       940',
    ' Can not obtain ownership information',
    '  UDP    192.168.1.5:5353       *:*                                    1500',
    ' [mDNSResponder.exe]',
].join('\n')

describe('BE-07 Windows netstat -bno continuation-line parsing', () => {
    it('resolves the bracketed exe name for the svchost-hosted entry with its real PID', () => {
        const conns = parseNetstatOutput(NETSTAT_BNO_FIXTURE)
        const svc = conns.find((c) => c.localPort === 51001)
        expect(svc).toBeDefined()
        expect(svc!.processName).toBe('svchost.exe')
        expect(svc!.processId).toBe(916)
    })

    it('preserves the chrome entry', () => {
        const conns = parseNetstatOutput(NETSTAT_BNO_FIXTURE)
        const chrome = conns.find((c) => c.localPort === 51000)
        expect(chrome).toBeDefined()
        expect(chrome!.processName).toBe('chrome.exe')
        expect(chrome!.processId).toBe(4321)
    })

    it('falls back to a PID-derived name when ownership cannot be obtained', () => {
        const conns = parseNetstatOutput(NETSTAT_BNO_FIXTURE)
        const listening = conns.find((c) => c.localPort === 135)
        expect(listening).toBeDefined()
        expect(listening!.processId).toBe(940)
        expect(listening!.processName).toContain('940')
    })

    it('captures the UDP row as a udp connection', () => {
        const conns = parseNetstatOutput(NETSTAT_BNO_FIXTURE)
        const udp = conns.find((c) => c.localPort === 5353)
        expect(udp).toBeDefined()
        expect(udp!.protocol).toBe('udp')
        expect(udp!.processName).toBe('mDNSResponder.exe')
        expect(udp!.processId).toBe(1500)
    })
})
