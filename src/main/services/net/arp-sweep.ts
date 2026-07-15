import { execFile } from 'node:child_process'
import os from 'node:os'

/**
 * Devices that nothing has talked to recently — a camera, a smart plug idling —
 * are absent from the ARP cache, so `arp -a` never sees them. A single ping to
 * each host on the local subnet forces the OS to ARP for it, which populates
 * the cache. We never read the ping result; the ARP side effect is the point.
 */

const MAX_HOSTS = 254
const PING_TIMEOUT_MS = 300
const CONCURRENCY = 32

export interface Ipv4Subnet {
    /** First usable host address, as a 32-bit integer. */
    first: number
    /** Last usable host address, as a 32-bit integer. */
    last: number
}

export function ipToInt(ip: string): number {
    const parts = ip.split('.').map(Number)
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
        throw new Error(`invalid IPv4 address: ${ip}`)
    }
    return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
}

export function intToIp(value: number): string {
    return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')
}

/**
 * Host range for an address/netmask, excluding the network and broadcast
 * addresses. Returns null for subnets too large to sweep politely (anything
 * wider than a /24 would mean thousands of pings).
 */
export function hostRange(ip: string, netmask: string): Ipv4Subnet | null {
    const addr = ipToInt(ip)
    const mask = ipToInt(netmask)
    const network = (addr & mask) >>> 0
    const broadcast = (network | (~mask >>> 0)) >>> 0

    const hosts = broadcast - network - 1
    if (hosts < 1 || hosts > MAX_HOSTS) return null

    return { first: network + 1, last: broadcast - 1 }
}

/** This machine's IPv4 on the LAN, or '' when only loopback is up. */
export function localIpv4(): string {
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const address of addresses ?? []) {
            if (address.family === 'IPv4' && !address.internal) return address.address
        }
    }
    return ''
}

/** The IPv4 subnet of the first non-internal interface, or null. */
export function localSubnet(): Ipv4Subnet | null {
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const address of addresses ?? []) {
            if (address.family !== 'IPv4' || address.internal) continue
            const range = hostRange(address.address, address.netmask)
            if (range) return range
        }
    }
    return null
}

/**
 * `-W` means milliseconds on macOS but whole seconds on Linux; Windows uses
 * `-n`/`-w`. Getting this wrong makes ping print usage and exit, which would
 * silently stop warming the ARP cache.
 */
export function pingArgs(ip: string, platform: string = process.platform): string[] {
    if (platform === 'win32') return ['-n', '1', '-w', String(PING_TIMEOUT_MS), ip]
    if (platform === 'darwin') return ['-c', '1', '-W', String(PING_TIMEOUT_MS), ip]
    return ['-c', '1', '-W', '1', ip]
}

// A packaged app may not have /sbin on PATH.
const PING_BINARIES = process.platform === 'win32' ? ['ping'] : ['/sbin/ping', '/bin/ping', 'ping']

function pingOnce(ip: string): Promise<void> {
    const args = pingArgs(ip)

    const attempt = (index: number): Promise<void> =>
        new Promise((resolve) => {
            const binary = PING_BINARIES[index]
            if (binary === undefined) return resolve()
            const child = execFile(binary, args, (error) => {
                // ENOENT means this path doesn't exist — try the next one. Any
                // other outcome (host down, timeout) is a normal, ignored result.
                if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
                    return resolve(attempt(index + 1))
                }
                resolve()
            })
            child.on('error', () => resolve(attempt(index + 1)))
        })

    return attempt(0)
}

/**
 * Ping every host on the local subnet so the ARP cache learns about devices
 * that are online but idle. Resolves once every probe has settled.
 */
export async function sweepLocalSubnet(subnet: Ipv4Subnet | null = localSubnet()): Promise<number> {
    if (!subnet) return 0

    const targets: string[] = []
    for (let value = subnet.first; value <= subnet.last; value += 1) {
        targets.push(intToIp(value))
    }

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
        await Promise.all(targets.slice(i, i + CONCURRENCY).map(pingOnce))
    }

    return targets.length
}
