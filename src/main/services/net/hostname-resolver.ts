import { reverse as reverseCallback } from 'node:dns'
import { promisify } from 'node:util'

const reverseAsync = promisify(reverseCallback)

export interface ResolvedHostname {
    ip: string
    hostname: string
}

export type ReverseLookup = (ip: string) => Promise<string[]>

/**
 * Default reverse-DNS implementation. Resolves ALL addresses, including
 * RFC1918 private ranges — this is intentional, since the devices we care about
 * (cameras, smart-home kit) live on the local subnet.
 */
const defaultReverse: ReverseLookup = (ip) => reverseAsync(ip)

export interface ResolveHostnamesOptions {
    /** Per-lookup reverse-DNS implementation. Override in tests. */
    reverse?: ReverseLookup
    /** Maximum time to spend resolving a single address. Default 800ms. */
    timeoutMs?: number
    /** Hard cap on the number of addresses resolved in one pass. Default 64. */
    maxLookups?: number
}

const DEFAULT_TIMEOUT_MS = 800
const DEFAULT_MAX_LOOKUPS = 64

/**
 * Reverse-resolve a batch of IP addresses to hostnames.
 *
 * Returns a Map of ip → hostname for every address that resolved successfully.
 * Failures (no PTR, timeout, NXDOMAIN) are silently dropped — callers fall
 * back to other sources (mDNS, ARP hostname, vendor).
 */
export async function resolveHostnames(
    ips: string[],
    options: ResolveHostnamesOptions = {},
): Promise<Map<string, string>> {
    const reverse = options.reverse ?? defaultReverse
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxLookups = options.maxLookups ?? DEFAULT_MAX_LOOKUPS

    const results = new Map<string, string>()
    const unique = Array.from(new Set(ips.filter(Boolean))).slice(0, maxLookups)

    await Promise.all(
        unique.map(async (ip) => {
            const hostname = await resolveOne(ip, reverse, timeoutMs)
            if (hostname !== null) results.set(ip, hostname)
        }),
    )

    return results
}

async function resolveOne(ip: string, reverse: ReverseLookup, timeoutMs: number): Promise<string | null> {
    try {
        const hostnames = await withTimeout(reverse(ip), timeoutMs)
        const hostname = hostnames?.[0]
        if (typeof hostname !== 'string' || hostname.length === 0) return null
        return hostname
    } catch {
        return null
    }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('reverse lookup timed out')), timeoutMs)
    })
    return Promise.race([promise, timeout]).finally(() => {
        if (timer !== undefined) clearTimeout(timer)
    })
}
