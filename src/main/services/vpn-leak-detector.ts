import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import type { VpnLeakStatus, CollectorHealth } from '@shared/types/m1'
import type { Alert } from '@shared/types/alert'
import type { IDatabaseService } from './database'
import type { FortisEventBus } from './event-bus'
import { evaluateVpnLeak } from './net/vpn-leak-eval'

const execFileAsync = promisify(execFile)
const COMMAND_TIMEOUT_MS = 15_000
const VPN_PREFIXES = ['utun', 'tun', 'tap', 'wg', 'ppp', 'ipsec', 'tailscale', 'wireguard']

interface VpnLeakDetectorDeps {
    database: IDatabaseService
    eventBus: FortisEventBus
    onAlert?: (alert: Alert) => void
}

function createDefaultStatus(now: number): VpnLeakStatus {
    return {
        verdict: 'warn',
        tunnelActive: false,
        tunnelInterface: null,
        defaultRouteThroughTunnel: false,
        explanation: 'VPN status has not been evaluated yet.',
        timestamp: now,
    }
}

function parseDarwinRoute(stdout: string): string | null {
    for (const line of stdout.split('\n')) {
        const match = line.match(/interface:\s*(\S+)/)
        if (match && match[1] !== undefined) {
            return match[1]
        }
    }
    return null
}

function parseLinuxRoute(stdout: string): string | null {
    for (const line of stdout.split('\n')) {
        const parts = line.trim().split(/\s+/)
        const devIndex = parts.indexOf('dev')
        if (devIndex !== -1) {
            const iface = parts[devIndex + 1]
            if (iface !== undefined) {
                return iface
            }
        }
    }
    return null
}

export class VpnLeakDetector {
    private readonly database: IDatabaseService
    private readonly eventBus: FortisEventBus
    private readonly onAlert: ((alert: Alert) => void) | null
    private current: VpnLeakStatus
    private health: CollectorHealth = 'ok'

    constructor(deps: VpnLeakDetectorDeps) {
        this.database = deps.database
        this.eventBus = deps.eventBus
        this.onAlert = deps.onAlert ?? null
        this.current = createDefaultStatus(Date.now())
    }

    getCurrentStatus(): VpnLeakStatus {
        return this.current
    }

    getHealth(): CollectorHealth {
        return this.health
    }

    async evaluate(): Promise<VpnLeakStatus> {
        try {
            const interfaces = Object.keys(os.networkInterfaces())
            const defaultRouteIface = await this.readDefaultRouteInterface()
            const now = Date.now()

            const status = evaluateVpnLeak(
                { interfaces, defaultRouteIface },
                VPN_PREFIXES,
                now,
            )

            const previousVerdict = this.current.verdict
            this.database.saveVpnStatus(status)
            this.current = status
            this.eventBus.emit('vpn:evaluated', { status })

            if (status.verdict === 'fail' && previousVerdict !== 'fail') {
                this.raiseLeakAlert(status, now)
            }

            return status
        } catch (error) {
            this.health = 'degraded'
            const reason = error instanceof Error ? error.message : String(error)
            console.warn(`[VpnLeakDetector] Evaluation failed (${process.platform}): ${reason}`)
            return this.current
        }
    }

    private raiseLeakAlert(status: VpnLeakStatus, now: number): void {
        const title = 'Possible VPN leak detected'
        const description = status.explanation
        const recommendation = 'Check your VPN configuration; your traffic may be exposed.'
        const dedupKey = 'vpn:leak'
        const connectionId = 'vpn:leak'

        const alertId = this.database.saveAlert({
            timestamp: now,
            type: 'system',
            threatLevel: 'warning',
            title,
            description,
            connectionId,
            recommendation,
            source: 'system',
            dedupKey,
        })

        if (this.onAlert) {
            this.onAlert({
                id: alertId,
                timestamp: now,
                type: 'system',
                threatLevel: 'warning',
                title,
                description,
                connectionId,
                recommendation,
                source: 'system',
                acknowledged: false,
                whitelisted: false,
                dedupKey,
                suppressedCount: 0,
                createdAt: now,
            })
        }
    }

    private async readDefaultRouteInterface(): Promise<string | null> {
        try {
            if (process.platform === 'darwin') {
                const { stdout } = await execFileAsync('route', ['-n', 'get', 'default'], {
                    timeout: COMMAND_TIMEOUT_MS,
                })
                this.health = 'ok'
                return parseDarwinRoute(stdout)
            }

            if (process.platform === 'linux') {
                const { stdout } = await execFileAsync('ip', ['route', 'show', 'default'], {
                    timeout: COMMAND_TIMEOUT_MS,
                })
                this.health = 'ok'
                return parseLinuxRoute(stdout)
            }

            if (process.platform === 'win32') {
                const { stdout } = await execFileAsync(
                    'powershell',
                    [
                        '-NoProfile',
                        '-Command',
                        "Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty InterfaceAlias",
                    ],
                    { timeout: COMMAND_TIMEOUT_MS },
                )
                this.health = 'ok'
                const alias = stdout.trim()
                return alias.length > 0 ? alias : null
            }

            this.health = 'unsupported'
            return null
        } catch (error) {
            this.health = 'degraded'
            const reason = error instanceof Error ? error.message : String(error)
            console.warn(`[VpnLeakDetector] Default route read failed (${process.platform}): ${reason}`)
            return null
        }
    }
}
