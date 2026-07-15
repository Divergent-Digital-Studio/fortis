import { describe, it, expect } from 'vitest'
import { evaluateVpnLeak } from './vpn-leak-eval'

const VPN_PREFIXES = ['utun', 'tun', 'tap', 'wg', 'ppp']
const NOW = 1_700_000_000_000

describe('evaluateVpnLeak', () => {
    it('returns pass when a tunnel is active and carries the default route', () => {
        const status = evaluateVpnLeak(
            { interfaces: ['en0', 'utun3', 'lo0'], defaultRouteIface: 'utun3' },
            VPN_PREFIXES,
            NOW,
        )
        expect(status.verdict).toBe('pass')
        expect(status.tunnelActive).toBe(true)
        expect(status.tunnelInterface).toBe('utun3')
        expect(status.defaultRouteThroughTunnel).toBe(true)
        expect(status.explanation).toBe('VPN tunnel utun3 is active and carrying your default route.')
        expect(status.timestamp).toBe(NOW)
    })

    it('returns fail when a tunnel is up but the default route leaves elsewhere', () => {
        const status = evaluateVpnLeak(
            { interfaces: ['en0', 'wg0'], defaultRouteIface: 'en0' },
            VPN_PREFIXES,
            NOW,
        )
        expect(status.verdict).toBe('fail')
        expect(status.tunnelActive).toBe(true)
        expect(status.tunnelInterface).toBe('wg0')
        expect(status.defaultRouteThroughTunnel).toBe(false)
        expect(status.explanation).toBe(
            'A VPN tunnel (wg0) is up, but traffic is leaving through en0 — possible leak.',
        )
    })

    it('returns warn when no tunnel interface is present', () => {
        const status = evaluateVpnLeak(
            { interfaces: ['en0', 'lo0'], defaultRouteIface: 'en0' },
            VPN_PREFIXES,
            NOW,
        )
        expect(status.verdict).toBe('warn')
        expect(status.tunnelActive).toBe(false)
        expect(status.tunnelInterface).toBeNull()
        expect(status.defaultRouteThroughTunnel).toBe(false)
        expect(status.explanation).toBe('No VPN tunnel detected. Traffic is unprotected by a VPN.')
    })

    it('matches VPN prefixes case-insensitively', () => {
        const status = evaluateVpnLeak(
            { interfaces: ['Ethernet', 'WG-Client'], defaultRouteIface: 'WG-Client' },
            VPN_PREFIXES,
            NOW,
        )
        expect(status.verdict).toBe('pass')
        expect(status.tunnelInterface).toBe('WG-Client')
        expect(status.defaultRouteThroughTunnel).toBe(true)
    })
})
