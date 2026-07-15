import type { VpnLeakStatus } from '@shared/types/m1'

interface VpnLeakInput {
    interfaces: string[]
    defaultRouteIface: string | null
}

function startsWithPrefix(name: string, prefixes: string[]): boolean {
    const lower = name.toLowerCase()
    return prefixes.some((prefix) => lower.startsWith(prefix.toLowerCase()))
}

function findTunnelInterface(interfaces: string[], prefixes: string[]): string | null {
    for (const name of interfaces) {
        if (startsWithPrefix(name, prefixes)) {
            return name
        }
    }
    return null
}

export function evaluateVpnLeak(
    input: VpnLeakInput,
    vpnPrefixes: string[],
    now: number,
): VpnLeakStatus {
    const tunnelInterface = findTunnelInterface(input.interfaces, vpnPrefixes)
    const tunnelActive = tunnelInterface !== null

    if (!tunnelActive) {
        return {
            verdict: 'warn',
            tunnelActive: false,
            tunnelInterface: null,
            defaultRouteThroughTunnel: false,
            explanation: 'No VPN tunnel detected. Traffic is unprotected by a VPN.',
            timestamp: now,
        }
    }

    const routeIface = input.defaultRouteIface
    const routeThroughTunnel =
        routeIface !== null &&
        (routeIface === tunnelInterface || startsWithPrefix(routeIface, vpnPrefixes))

    if (routeThroughTunnel) {
        return {
            verdict: 'pass',
            tunnelActive: true,
            tunnelInterface,
            defaultRouteThroughTunnel: true,
            explanation: `VPN tunnel ${tunnelInterface} is active and carrying your default route.`,
            timestamp: now,
        }
    }

    return {
        verdict: 'fail',
        tunnelActive: true,
        tunnelInterface,
        defaultRouteThroughTunnel: false,
        explanation: `A VPN tunnel (${tunnelInterface}) is up, but traffic is leaving through ${routeIface ?? 'an unknown interface'} — possible leak.`,
        timestamp: now,
    }
}
