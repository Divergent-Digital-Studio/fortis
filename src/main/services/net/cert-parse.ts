import type { TlsCertInfo, CertStatus } from '../../../shared/types/m3';

interface PeerCertLike {
    issuer?: Record<string, string>;
    subject?: Record<string, string>;
    valid_from?: string;
    valid_to?: string;
}

const EXPIRING_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function dn(d?: Record<string, string>): string | null {
    if (!d) return null;
    return d.CN ?? d.O ?? Object.values(d)[0] ?? null;
}

export function parseCert(cert: PeerCertLike, host: string, port: number, nowMs: number): TlsCertInfo {
    const hostPort = `${host}:${port}`;
    const base: TlsCertInfo = {
        hostPort,
        host,
        port,
        issuer: null,
        subject: null,
        validFrom: null,
        validTo: null,
        daysUntilExpiry: null,
        selfSigned: false,
        status: 'error',
        lastChecked: nowMs,
    };
    if (!cert || !cert.valid_to || !cert.valid_from) return base;
    const validFrom = Date.parse(cert.valid_from);
    const validTo = Date.parse(cert.valid_to);
    if (Number.isNaN(validFrom) || Number.isNaN(validTo)) return base;
    const issuer = dn(cert.issuer);
    const subject = dn(cert.subject);
    const daysUntilExpiry = Math.round((validTo - nowMs) / DAY_MS);
    const selfSigned = !!issuer && !!subject && issuer === subject;
    let status: CertStatus;
    if (validTo < nowMs) status = 'expired';
    else if (selfSigned) status = 'self-signed';
    else if (daysUntilExpiry <= EXPIRING_DAYS) status = 'expiring';
    else status = 'valid';
    return {
        hostPort,
        host,
        port,
        issuer,
        subject,
        validFrom,
        validTo,
        daysUntilExpiry,
        selfSigned,
        status,
        lastChecked: nowMs,
    };
}
