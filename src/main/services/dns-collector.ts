import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import dns from 'node:dns'
import type { DnsQueryRecord, CollectorHealth } from '@shared/types/m1'
import type { NetworkConnection } from '@shared/types'
import type { IDatabaseService } from './database'
import type { FortisEventBus } from './event-bus'
import { parseWindowsDnsCache, parseDscacheutil, type DnsCacheEntry } from './net/dns-cache-parse'
import { isPrivateOrReservedIpv4 } from './datasets/ip-uint'

const execFileAsync = promisify(execFile)
const COMMAND_TIMEOUT_MS = 15_000
const DEFAULT_INTERVAL_MS = 15_000
const PTR_TIMEOUT_MS = 2_000
const MAX_PTR_LOOKUPS = 25

interface DnsCollectorDeps {
    database: IDatabaseService
    eventBus: FortisEventBus
    getConnections: () => NetworkConnection[]
    intervalMs?: number
}

export class DnsCollector {
    private readonly database: IDatabaseService
    private readonly eventBus: FortisEventBus
    private readonly getConnections: () => NetworkConnection[]
    private readonly intervalMs: number
    private timer: ReturnType<typeof setInterval> | null = null
    private health: CollectorHealth = 'ok'

    constructor(deps: DnsCollectorDeps) {
        this.database = deps.database
        this.eventBus = deps.eventBus
        this.getConnections = deps.getConnections
        this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
    }

    start(): void {
        if (this.timer) return
        void this.collect()
        this.timer = setInterval(() => {
            void this.collect()
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

    async collect(): Promise<DnsQueryRecord[]> {
        try {
            const connections = this.getConnections()
            const now = Date.now()

            const cacheEntries = await this.readDnsCache()
            for (const entry of cacheEntries) {
                const processName = this.attributeProcess(connections, entry.resolvedIp)
                const record: DnsQueryRecord = {
                    id: randomUUID(),
                    domain: entry.domain,
                    resolvedIp: entry.resolvedIp,
                    source: 'cache',
                    processName,
                    firstSeen: now,
                    lastSeen: now,
                    hitCount: 1,
                }
                this.database.upsertDnsQuery(record)
            }

            await this.collectReversePtr(connections, now)

            const records = this.database.getDnsQueries()
            this.eventBus.emit('dns:collected', { records })
            return records
        } catch (error) {
            this.health = 'degraded'
            const reason = error instanceof Error ? error.message : String(error)
            console.warn(`[DnsCollector] Collection failed (${process.platform}): ${reason}`)
            return this.database.getDnsQueries()
        }
    }

    private async readDnsCache(): Promise<DnsCacheEntry[]> {
        try {
            if (process.platform === 'darwin') {
                const { stdout } = await execFileAsync(
                    'dscacheutil',
                    ['-cachedump', '-entries', 'Host'],
                    { timeout: COMMAND_TIMEOUT_MS },
                )
                this.health = 'ok'
                return parseDscacheutil(stdout)
            }

            if (process.platform === 'win32') {
                const { stdout } = await execFileAsync(
                    'powershell',
                    ['-NoProfile', '-Command', 'Get-DnsClientCache | Select-Object Entry,RecordName,RecordType,Data | ConvertTo-Csv -NoTypeInformation'],
                    { timeout: COMMAND_TIMEOUT_MS },
                )
                this.health = 'ok'
                return parseWindowsDnsCache(stdout)
            }

            this.health = 'ok'
            return []
        } catch (error) {
            this.health = 'degraded'
            const reason = error instanceof Error ? error.message : String(error)
            console.warn(`[DnsCollector] DNS cache read failed (${process.platform}): ${reason}`)
            return []
        }
    }

    private async collectReversePtr(connections: NetworkConnection[], now: number): Promise<void> {
        const seen = new Set<string>()
        const targets: string[] = []

        for (const connection of connections) {
            const ip = connection.remoteAddress
            if (!ip || seen.has(ip)) continue
            if (isPrivateOrReservedIpv4(ip)) continue
            seen.add(ip)
            targets.push(ip)
            if (targets.length >= MAX_PTR_LOOKUPS) break
        }

        for (const ip of targets) {
            try {
                const hostnames = await this.reverseWithTimeout(ip)
                const hostname = hostnames[0]
                if (hostname === undefined || hostname.length === 0) continue

                const processName = this.attributeProcess(connections, ip)
                const record: DnsQueryRecord = {
                    id: randomUUID(),
                    domain: hostname,
                    resolvedIp: ip,
                    source: 'ptr',
                    processName,
                    firstSeen: now,
                    lastSeen: now,
                    hitCount: 1,
                }
                this.database.upsertDnsQuery(record)
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error)
                console.warn(`[DnsCollector] Reverse PTR lookup skipped for ${ip}: ${reason}`)
            }
        }
    }

    private reverseWithTimeout(ip: string): Promise<string[]> {
        const lookup = dns.promises.reverse(ip)
        let timer: ReturnType<typeof setTimeout> | null = null
        const timeout = new Promise<string[]>((_resolve, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`PTR lookup timed out after ${PTR_TIMEOUT_MS}ms`))
            }, PTR_TIMEOUT_MS)
        })
        return Promise.race([lookup, timeout]).finally(() => {
            if (timer) clearTimeout(timer)
        })
    }

    private attributeProcess(connections: NetworkConnection[], ip: string): string | null {
        const match = connections.find((connection) => connection.remoteAddress === ip)
        return match ? match.processName : null
    }
}
