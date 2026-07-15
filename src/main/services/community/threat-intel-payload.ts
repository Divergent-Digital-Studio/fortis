import type { Alert } from '../../../shared/types/alert';
import type { ThreatIntelSubmission } from '../../../shared/types/m7';

const BUCKET_MS = 5 * 60 * 1000;

export function categoryFor(alert: Alert): string {
    const t = `${alert.title} ${alert.description}`.toLowerCase();
    if (t.includes('beacon') || t.includes('c2') || t.includes('command')) return 'beaconing';
    if (t.includes('exfil') || t.includes('egress') || t.includes('upload')) return 'exfiltration';
    if (t.includes('scan') || t.includes('probe')) return 'scanning';
    if (t.includes('crypto') || t.includes('miner')) return 'cryptomining';
    return 'anomalous-connection';
}

export function buildSubmission(alert: Alert, hashIP: (ip: string) => string): ThreatIntelSubmission {
    return {
        destHash: hashIP(alert.remoteAddress as string),
        destPort: typeof alert.remotePort === 'number' ? alert.remotePort : null,
        threatLevel: alert.threatLevel,
        category: categoryFor(alert),
        bucketedAt: Math.floor(alert.timestamp / BUCKET_MS) * BUCKET_MS,
    };
}

export function buildSubmissionBatch(alerts: Alert[], hashIP: (ip: string) => string): ThreatIntelSubmission[] {
    return alerts
        .filter((a) => typeof a.remoteAddress === 'string' && a.remoteAddress.length > 0)
        .map((a) => buildSubmission(a, hashIP));
}
