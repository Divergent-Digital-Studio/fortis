import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lookup } from 'node:dns/promises';
import { app } from 'electron';
import type { FortisEventBus } from './event-bus';
import type { NetworkMonitor } from './network-monitor';
import type { Alert, AlertSource, AlertType } from '@shared/types/alert';
import type { ThreatLevel } from '@shared/types/analysis';

const ALLOWED_ENDPOINTS: ReadonlySet<string> = new Set([
    'api.openai.com',
    'api.anthropic.com',
]);

const SELF_MONITOR_CHECK_INTERVAL_MS = 30_000;
const DNS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const LOG_PREFIX = '[SelfMonitor]';

interface IntegrityCheckResult {
    passed: boolean;
    hash: string;
    storedHash: string | null;
    isFirstRun: boolean;
}

interface OutboundViolation {
    processName: string;
    remoteAddress: string;
    remotePort: number;
    timestamp: number;
}

interface SelfMonitorStats {
    integrityCheckPassed: boolean | null;
    lastIntegrityCheckTimestamp: number | null;
    outboundViolationCount: number;
    monitoringActive: boolean;
    lastCheckTimestamp: number | null;
}

export class SelfMonitorService {
    private eventBus: FortisEventBus;
    private monitor: NetworkMonitor | null = null;
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    private storedBinaryHash: string | null = null;
    private integrityCheckPassed: boolean | null = null;
    private lastIntegrityCheckTimestamp: number | null = null;
    private outboundViolationCount = 0;
    private lastCheckTimestamp: number | null = null;
    private monitoringActive = false;
    private seenViolations: Map<string, number> = new Map();
    private updateCheckEndpoint: string | null = null;
    private resolvedAllowedIPs: Set<string> = new Set();
    private dnsRefreshTimer: ReturnType<typeof setInterval> | null = null;

    constructor(eventBus: FortisEventBus) {
        this.eventBus = eventBus;
    }

    setNetworkMonitor(networkMonitor: NetworkMonitor): void {
        this.monitor = networkMonitor;
    }

    setUpdateCheckEndpoint(endpoint: string): void {
        this.updateCheckEndpoint = endpoint;
    }

    async initialize(): Promise<void> {
        await this.runIntegrityCheck();
        await this.refreshAllowedIPs();
        this.startDNSRefreshTimer();
        this.startOutboundMonitoring();
    }

    async runIntegrityCheck(): Promise<IntegrityCheckResult> {
        const bundlePath = this.getMainBundlePath();
        let currentHash = '';

        try {
            const bundleContent = await readFile(bundlePath);
            currentHash = createHash('sha256').update(bundleContent).digest('hex');
        } catch (err) {
            console.warn(`${LOG_PREFIX} Could not read main bundle for integrity check:`, err);
            this.integrityCheckPassed = null;
            this.lastIntegrityCheckTimestamp = Date.now();
            return {
                passed: false,
                hash: '',
                storedHash: this.storedBinaryHash,
                isFirstRun: true,
            };
        }

        this.lastIntegrityCheckTimestamp = Date.now();

        if (this.storedBinaryHash === null) {
            this.storedBinaryHash = currentHash;
            this.integrityCheckPassed = true;
            console.info(`${LOG_PREFIX} First run — storing binary hash: ${currentHash.slice(0, 12)}...`);
            return {
                passed: true,
                hash: currentHash,
                storedHash: null,
                isFirstRun: true,
            };
        }

        const passed = currentHash === this.storedBinaryHash;
        this.integrityCheckPassed = passed;

        if (!passed) {
            console.error(`${LOG_PREFIX} Binary integrity mismatch! Expected: ${this.storedBinaryHash.slice(0, 12)}..., Got: ${currentHash.slice(0, 12)}...`);
            this.emitSystemAlert(
                'Binary Integrity Check Failed',
                'The main process bundle has been modified since last verified launch. This could indicate tampering.',
                'Verify the application has not been tampered with. Reinstall from an official source if this is unexpected.',
                'critical',
            );
        } else {
            console.info(`${LOG_PREFIX} Binary integrity check passed: ${currentHash.slice(0, 12)}...`);
        }

        return {
            passed,
            hash: currentHash,
            storedHash: this.storedBinaryHash,
            isFirstRun: false,
        };
    }

    startOutboundMonitoring(): void {
        if (this.monitoringActive) return;

        this.monitoringActive = true;
        this.checkInterval = setInterval(() => {
            this.auditOutboundConnections();
        }, SELF_MONITOR_CHECK_INTERVAL_MS);

        console.info(`${LOG_PREFIX} Outbound connection monitoring started (interval: ${SELF_MONITOR_CHECK_INTERVAL_MS / 1000}s)`);
    }

    stopOutboundMonitoring(): void {
        if (this.checkInterval !== null) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.monitoringActive = false;
        console.info(`${LOG_PREFIX} Outbound connection monitoring stopped`);
    }

    private auditOutboundConnections(): void {
        if (!this.monitor) return;

        const connections = this.monitor.getPreviousConnections();
        this.lastCheckTimestamp = Date.now();

        const appPid = process.pid;
        const electronAppName = app.getName().toLowerCase();

        const appConnections = connections.filter((conn) => {
            if (conn.processId === appPid) return true;
            const processLower = conn.processName.toLowerCase();
            return (
                processLower === electronAppName ||
                processLower.includes('fortis') ||
                processLower.includes('electron')
            );
        });

        const outboundConnections = appConnections.filter(
            (conn) => conn.state === 'ESTABLISHED' && conn.remoteAddress !== '127.0.0.1' && conn.remoteAddress !== '::1' && conn.remoteAddress !== '0.0.0.0' && conn.remoteAddress !== '::',
        );

        for (const conn of outboundConnections) {
            const endpoint = conn.remoteAddress;
            const isAllowed = this.isEndpointAllowed(endpoint);

            if (!isAllowed) {
                const violationKey = `${endpoint}:${conn.remotePort}`;
                const lastSeen = this.seenViolations.get(violationKey) ?? 0;
                const now = Date.now();

                if (now - lastSeen > 300_000) {
                    this.seenViolations.set(violationKey, now);
                    this.outboundViolationCount++;

                    const violation: OutboundViolation = {
                        processName: conn.processName,
                        remoteAddress: endpoint,
                        remotePort: conn.remotePort,
                        timestamp: now,
                    };

                    console.warn(`${LOG_PREFIX} Unauthorized outbound connection detected:`, violation);

                    this.emitSystemAlert(
                        'Unauthorized Outbound Connection',
                        `Fortis detected an outbound connection to ${endpoint}:${conn.remotePort} which is not in the allowed endpoint whitelist. Process: ${conn.processName}`,
                        'Review this connection. If unexpected, the application may have been compromised or a third-party dependency is making unauthorized network requests.',
                        'danger',
                    );
                }
            }
        }

        this.cleanupOldViolations();
    }

    private isEndpointAllowed(remoteAddress: string): boolean {
        if (ALLOWED_ENDPOINTS.has(remoteAddress)) return true;

        if (this.resolvedAllowedIPs.has(remoteAddress)) return true;

        if (this.updateCheckEndpoint && remoteAddress === this.updateCheckEndpoint) return true;

        if (this.isLocalhostAddress(remoteAddress)) return true;

        for (const endpoint of ALLOWED_ENDPOINTS) {
            if (remoteAddress.endsWith(`.${endpoint}`)) return true;
        }

        return false;
    }

    private isLocalhostAddress(address: string): boolean {
        return (
            address === '127.0.0.1' ||
            address === '::1' ||
            address === 'localhost' ||
            address.startsWith('127.') ||
            address === '0.0.0.0' ||
            address === '::'
        );
    }

    private cleanupOldViolations(): void {
        const now = Date.now();
        const maxAge = 3_600_000;

        for (const [key, timestamp] of this.seenViolations) {
            if (now - timestamp > maxAge) {
                this.seenViolations.delete(key);
            }
        }
    }

    private getMainBundlePath(): string {
        if (app.isPackaged) {
            return join(app.getAppPath(), 'dist', 'main', 'index.js');
        }
        return join(app.getAppPath(), 'out', 'main', 'index.js');
    }

    private emitSystemAlert(
        title: string,
        description: string,
        recommendation: string,
        threatLevel: ThreatLevel,
    ): void {
        const alert: Alert = {
            id: `self-monitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            type: 'system' as AlertType,
            threatLevel,
            title,
            description,
            connectionId: 'self-monitor',
            recommendation,
            confidence: 1.0,
            acknowledged: false,
            whitelisted: false,
            source: 'system' as AlertSource,
            dedupKey: `self-monitor:${title.toLowerCase().replace(/\s+/g, '-')}`,
            suppressedCount: 0,
            createdAt: Date.now(),
        };

        this.eventBus.emit('threat:detected', { alert });
    }

    getStoredHash(): string | null {
        return this.storedBinaryHash;
    }

    setStoredHash(hash: string): void {
        this.storedBinaryHash = hash;
    }

    getStats(): SelfMonitorStats {
        return {
            integrityCheckPassed: this.integrityCheckPassed,
            lastIntegrityCheckTimestamp: this.lastIntegrityCheckTimestamp,
            outboundViolationCount: this.outboundViolationCount,
            monitoringActive: this.monitoringActive,
            lastCheckTimestamp: this.lastCheckTimestamp,
        };
    }

    getAllowedEndpoints(): readonly string[] {
        const endpoints = [...ALLOWED_ENDPOINTS];
        if (this.updateCheckEndpoint) {
            endpoints.push(this.updateCheckEndpoint);
        }
        return endpoints;
    }

    private async refreshAllowedIPs(): Promise<void> {
        const freshIPs = new Set<string>();

        for (const endpoint of ALLOWED_ENDPOINTS) {
            try {
                const results = await lookup(endpoint, { all: true });
                for (const result of results) {
                    freshIPs.add(result.address);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`${LOG_PREFIX} DNS resolve failed for ${endpoint}: ${msg}`);
            }
        }

        if (this.updateCheckEndpoint) {
            try {
                const results = await lookup(this.updateCheckEndpoint, { all: true });
                for (const result of results) {
                    freshIPs.add(result.address);
                }
            } catch {
                // noop — update endpoint DNS failure is non-critical
            }
        }

        this.resolvedAllowedIPs = freshIPs;

        if (freshIPs.size > 0) {
            console.info(`${LOG_PREFIX} Resolved ${freshIPs.size} allowed IPs from ${ALLOWED_ENDPOINTS.size} endpoints`);
        }
    }

    private startDNSRefreshTimer(): void {
        this.dnsRefreshTimer = setInterval(() => {
            this.refreshAllowedIPs().catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`${LOG_PREFIX} Periodic DNS refresh failed: ${msg}`);
            });
        }, DNS_REFRESH_INTERVAL_MS);
    }

    dispose(): void {
        this.stopOutboundMonitoring();
        if (this.dnsRefreshTimer !== null) {
            clearInterval(this.dnsRefreshTimer);
            this.dnsRefreshTimer = null;
        }
        this.seenViolations.clear();
        this.resolvedAllowedIPs.clear();
        this.outboundViolationCount = 0;
    }
}
