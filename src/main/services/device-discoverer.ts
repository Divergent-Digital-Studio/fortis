import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WifiDevice, CollectorHealth } from '@shared/types/m1'
import type { Alert } from '@shared/types/alert'
import type { IDatabaseService } from './database'
import type { FortisEventBus } from './event-bus'
import { parseArpMac, parseIpNeigh, parseGetNetNeighbor, type ArpEntry } from './net/arp-parse'
import { resolveHostnames } from './net/hostname-resolver'
import { sweepLocalSubnet } from './net/arp-sweep'
import { diffDevices } from './net/device-diff'
import { lookupVendor, type OuiMap } from './datasets/oui-lookup'
import { classifyIot } from './datasets/iot-classify'
import { deviceLabel } from '@shared/utils/device-label'

const execFileAsync = promisify(execFile)

/**
 * Run the first command that exists. A packaged app launched from Finder or a
 * desktop launcher inherits a minimal PATH that may not contain /usr/sbin, so
 * absolute paths are tried before bare names.
 */
async function runFirstAvailable(
    candidates: ReadonlyArray<{ file: string; args: string[] }>,
    timeout: number,
): Promise<string> {
    let lastError: unknown = new Error('no candidates given')
    for (const { file, args } of candidates) {
        try {
            const { stdout } = await execFileAsync(file, args, { timeout })
            return stdout
        } catch (error) {
            lastError = error
        }
    }
    throw lastError
}

const COMMAND_TIMEOUT_MS = 15_000
const DEFAULT_INTERVAL_MS = 30_000
const SWEEP_INTERVAL_MS = 5 * 60_000

/**
 * Resolves a batch of IP addresses to hostnames. The default implementation
 * performs reverse-DNS (PTR) lookups including private ranges; injected here so
 * tests can stub it and so callers control the strategy.
 */
export type ResolveHostnamesFn = (ips: string[]) => Promise<Map<string, string>>

interface DeviceDiscovererDeps {
    database: IDatabaseService
    eventBus: FortisEventBus
    ouiMap: OuiMap
    onAlert?: (alert: Alert) => void
    intervalMs?: number
    /** Optional hostname resolver (default: reverse-DNS via hostname-resolver). */
    resolveHostnames?: ResolveHostnamesFn
    /** Optional ARP-cache warmer (default: ping-sweep the local subnet). */
    sweepSubnet?: () => Promise<unknown>
}

export class DeviceDiscoverer {
    private readonly database: IDatabaseService
    private readonly eventBus: FortisEventBus
    private readonly ouiMap: OuiMap
    private readonly onAlert: ((alert: Alert) => void) | null
    private readonly intervalMs: number
    private readonly resolveHostnamesFn: ResolveHostnamesFn
    private readonly sweepSubnetFn: () => Promise<unknown>
    private timer: ReturnType<typeof setInterval> | null = null
    private health: CollectorHealth = 'ok'
    private lastSweepAt = 0

    constructor(deps: DeviceDiscovererDeps) {
        this.database = deps.database
        this.eventBus = deps.eventBus
        this.ouiMap = deps.ouiMap
        this.onAlert = deps.onAlert ?? null
        this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
        this.resolveHostnamesFn = deps.resolveHostnames ?? ((ips) => resolveHostnames(ips))
        this.sweepSubnetFn = deps.sweepSubnet ?? (() => sweepLocalSubnet())
    }

    start(): void {
        if (this.timer) return
        void this.discover()
        this.timer = setInterval(() => {
            void this.discover()
        }, this.intervalMs)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    getHealth(): CollectorHealth {
        return this.health
    }

    async discover(): Promise<WifiDevice[]> {
        // Wake idle devices (cameras, plugs) into the ARP cache first, otherwise
        // they stay invisible until something else on the LAN talks to them.
        // ~11s for a /24, so it runs far less often than the 30s scan; ARP
        // entries outlive the gap comfortably.
        const now0 = Date.now()
        if (now0 - this.lastSweepAt >= SWEEP_INTERVAL_MS) {
            this.lastSweepAt = now0
            try {
                await this.sweepSubnetFn()
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error)
                console.warn(`[DeviceDiscoverer] ARP sweep failed, continuing: ${reason}`)
            }
        }

        const entries = await this.readNeighborTable()
        const now = Date.now()

        const previousMacs = new Set(this.database.getWifiDevices().map((d) => d.mac))
        const existing = new Map(this.database.getWifiDevices().map((d) => [d.mac, d]))
        const { newDevices } = diffDevices(previousMacs, entries)
        const newMacSet = new Set(newDevices.map((d) => d.mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase().slice(0, 12)))

        // Resolve hostnames for entries that didn't already carry one from the
        // neighbor table (e.g. on macOS `arp -a` resolves .local names via the
        // system mDNSResponder; on Linux/Windows we fall back to reverse-DNS).
        const unresolvedIps = entries
            .filter((entry) => entry.hostname === null)
            .map((entry) => entry.ip)
        const resolvedByPtr =
            unresolvedIps.length > 0 ? await this.resolveHostnamesFn(unresolvedIps) : new Map<string, string>()

        for (const entry of entries) {
            const vendor = lookupVendor(this.ouiMap, entry.mac)
            const normalizedMac = entry.mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase().slice(0, 12)
            const prior = existing.get(normalizedMac)

            // Prefer a freshly-resolved name; only carry over the stored name if
            // nothing new was discovered this pass (keeps a known name stable).
            const resolvedHostname = entry.hostname ?? resolvedByPtr.get(entry.ip) ?? null
            const hostname = resolvedHostname ?? prior?.hostname ?? null

            // Classified after the hostname resolves, so the hostname fallback
            // can catch devices whose vendor is generic or unknown.
            const classification = classifyIot(vendor, hostname)

            const device: WifiDevice = {
                mac: normalizedMac,
                ip: entry.ip,
                vendor,
                hostname,
                // Preserve any user-set custom name across re-scans.
                customName: prior?.customName ?? null,
                firstSeen: prior?.firstSeen ?? now,
                lastSeen: now,
                isIot: classification.isIot,
                iotCategory: classification.category,
            }

            this.database.upsertWifiDevice(device)

            if (newMacSet.has(normalizedMac)) {
                this.raiseNewDeviceAlert(device, now)
            }
        }

        const devices = this.database.getWifiDevices()
        this.eventBus.emit('devices:discovered', { devices })
        return devices
    }

    private raiseNewDeviceAlert(device: WifiDevice, now: number): void {
        const title = `New device on network: ${deviceLabel(device)}`
        const description = `A previously unseen device (${device.ip}, ${device.mac}) joined your network.`
        const recommendation = 'Verify this device belongs to you. If unrecognized, investigate.'
        const dedupKey = `device:${device.mac}`

        const alertId = this.database.saveAlert({
            timestamp: now,
            type: 'system',
            threatLevel: 'info',
            title,
            description,
            connectionId: dedupKey,
            recommendation,
            source: 'system',
            dedupKey,
        })

        if (this.onAlert) {
            this.onAlert({
                id: alertId,
                timestamp: now,
                type: 'system',
                threatLevel: 'info',
                title,
                description,
                connectionId: dedupKey,
                recommendation,
                source: 'system',
                acknowledged: false,
                whitelisted: false,
                dedupKey,
                suppressedCount: 0,
                createdAt: now,
            })
        }

        this.eventBus.emit('alert:device-new', { mac: device.mac })
    }

    private async readNeighborTable(): Promise<ArpEntry[]> {
        try {
            if (process.platform === 'darwin') {
                // `-n` keeps this numeric. Letting arp resolve names itself means a
                // blocking PTR lookup per row — with link-local and multicast rows
                // in the table that took 30s and blew the timeout, so the whole
                // scan returned nothing. Hostnames come from resolveHostnames(),
                // which caps each lookup at 800ms.
                const stdout = await runFirstAvailable(
                    [{ file: '/usr/sbin/arp', args: ['-an'] }, { file: 'arp', args: ['-an'] }],
                    COMMAND_TIMEOUT_MS,
                )
                this.health = 'ok'
                return parseArpMac(stdout)
            }

            if (process.platform === 'linux') {
                // `ip` lives in /sbin or /usr/sbin depending on the distro, and is
                // absent on minimal images — fall back to the older `arp`.
                try {
                    const stdout = await runFirstAvailable(
                        [
                            { file: '/sbin/ip', args: ['neigh'] },
                            { file: '/usr/sbin/ip', args: ['neigh'] },
                            { file: 'ip', args: ['neigh'] },
                        ],
                        COMMAND_TIMEOUT_MS,
                    )
                    this.health = 'ok'
                    return parseIpNeigh(stdout)
                } catch {
                    const stdout = await runFirstAvailable(
                        [{ file: '/usr/sbin/arp', args: ['-an'] }, { file: 'arp', args: ['-an'] }],
                        COMMAND_TIMEOUT_MS,
                    )
                    this.health = 'ok'
                    return parseArpMac(stdout)
                }
            }

            if (process.platform === 'win32') {
                const { stdout } = await execFileAsync(
                    'powershell',
                    ['-NoProfile', '-Command', 'Get-NetNeighbor -AddressFamily IPv4 | Select-Object IPAddress,LinkLayerAddress,State | ConvertTo-Csv -NoTypeInformation'],
                    { timeout: COMMAND_TIMEOUT_MS },
                )
                this.health = 'ok'
                return parseGetNetNeighbor(stdout)
            }

            this.health = 'unsupported'
            return []
        } catch (error) {
            this.health = 'degraded'
            const reason = error instanceof Error ? error.message : String(error)
            console.warn(`[DeviceDiscoverer] Neighbor table read failed (${process.platform}): ${reason}`)
            return []
        }
    }
}
