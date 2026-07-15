import tls from 'node:tls';
import type { DatabaseService } from './database';
import type { FortisEventBus } from './event-bus';
import type { Alert } from '../../shared/types/alert';
import type { NetworkConnection } from '../../shared/types/connection';
import type { TlsCertInfo } from '../../shared/types/m3';
import { parseCert } from './net/cert-parse';
import { isPrivateOrReservedIpv4 } from './datasets/ip-uint';

const TLS_PORTS = new Set([443, 465, 993, 995, 8443]);
const RECHECK_MS = 24 * 60 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 5000;

interface CertMonitorDeps {
    database: DatabaseService;
    eventBus: FortisEventBus;
    onAlert?: (alert: Alert) => void;
}

function isExternalIp(ip: string): boolean {
    if (!ip) return false;
    if (ip.includes(':')) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '::') return false;
        if (lower.startsWith('fc') || lower.startsWith('fd')) return false;
        if (lower.startsWith('fe80')) return false;
        return true;
    }
    return !isPrivateOrReservedIpv4(ip);
}

function errorInfo(host: string, port: number, now: number): TlsCertInfo {
    return {
        hostPort: `${host}:${port}`,
        host,
        port,
        issuer: null,
        subject: null,
        validFrom: null,
        validTo: null,
        daysUntilExpiry: null,
        selfSigned: false,
        status: 'error',
        lastChecked: now,
    };
}

export class CertMonitor {
    private lastChecked = new Map<string, number>();
    private handler: ((p: { connections: NetworkConnection[] }) => void) | null = null;
    private loggedRationale = false;

    constructor(private deps: CertMonitorDeps) {}

    start(): void {
        if (this.handler) return;
        this.handler = (p): void => {
            void this.inspect(p.connections);
        };
        this.deps.eventBus.on('scan:complete', this.handler);
    }

    stop(): void {
        if (this.handler) {
            this.deps.eventBus.off('scan:complete', this.handler);
            this.handler = null;
        }
    }

    getCerts(): TlsCertInfo[] {
        return this.deps.database.getTlsCerts();
    }

    private async inspect(connections: NetworkConnection[]): Promise<void> {
        const now = Date.now();
        const targets = new Map<string, { host: string; port: number }>();
        for (const c of connections) {
            const host = c.remoteAddress;
            const port = c.remotePort;
            if (!host || !port || !TLS_PORTS.has(port)) continue;
            if (!isExternalIp(host)) continue;
            const key = `${host}:${port}`;
            const last = this.lastChecked.get(key) ?? 0;
            if (now - last < RECHECK_MS) continue;
            targets.set(key, { host, port });
        }
        if (targets.size === 0) return;
        for (const { host, port } of targets.values()) {
            this.lastChecked.set(`${host}:${port}`, now);
            await this.pull(host, port, now);
        }
        this.deps.eventBus.emit('certs:updated', { certs: this.deps.database.getTlsCerts() });
    }

    private pull(host: string, port: number, now: number): Promise<void> {
        return new Promise((resolve) => {
            if (!this.loggedRationale) {
                this.loggedRationale = true;
                console.info(
                    '[Cert] inspection-only TLS handshake (rejectUnauthorized=false); reads peer cert, sends no data',
                );
            }
            let settled = false;
            const finish = (info: TlsCertInfo): void => {
                if (settled) return;
                settled = true;
                this.deps.database.upsertTlsCert(info);
                this.maybeAlert(info);
                resolve();
            };
            try {
                const socket = tls.connect(
                    { host, port, rejectUnauthorized: false, timeout: CONNECT_TIMEOUT_MS },
                    () => {
                        const peer = socket.getPeerCertificate(true) as unknown;
                        socket.destroy();
                        finish(parseCert(peer as never, host, port, now));
                    },
                );
                socket.on('error', (err) => {
                    console.error(`[Cert] handshake error ${host}:${port}: ${err.message}`);
                    socket.destroy();
                    finish(errorInfo(host, port, now));
                });
                socket.on('timeout', () => {
                    console.error(`[Cert] handshake timeout ${host}:${port}`);
                    socket.destroy();
                    finish(errorInfo(host, port, now));
                });
            } catch (err) {
                console.error(`[Cert] connect threw ${host}:${port}:`, err);
                finish(errorInfo(host, port, now));
            }
        });
    }

    private maybeAlert(info: TlsCertInfo): void {
        if (info.status === 'valid' || info.status === 'error') return;
        if (!this.deps.onAlert) return;
        const now = Date.now();
        const dedupKey = `cert:${info.hostPort}:${info.status}`;
        const expiryNote = info.daysUntilExpiry !== null ? ` (${info.daysUntilExpiry} days to expiry)` : '';
        const alert = {
            timestamp: now,
            type: 'system' as const,
            threatLevel: info.status === 'expired' ? ('danger' as const) : ('warning' as const),
            title: `TLS certificate ${info.status}: ${info.host}`,
            description: `The certificate for ${info.hostPort} is ${info.status}${expiryNote}.`,
            connectionId: info.hostPort,
            recommendation:
                'Verify this endpoint is trustworthy; an invalid certificate can indicate interception or a misconfigured server.',
            source: 'system' as const,
            dedupKey,
        };
        const id = this.deps.database.saveAlert(alert);
        this.deps.onAlert({
            id,
            acknowledged: false,
            whitelisted: false,
            suppressedCount: 0,
            createdAt: now,
            ...alert,
        });
    }
}
