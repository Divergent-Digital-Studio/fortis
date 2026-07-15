import { createHash, randomBytes } from 'crypto';
import { basename } from 'path';
import type { NetworkConnection } from '../../shared/types/connection';
import type { AnonymizedPayload, AnonymizedConnection } from '../../shared/types/analysis';

const ANONYMIZER_SALT_KEY = 'fortis-anonymizer-salt-v1';

let appLocalSalt: string | null = null;

function getOrCreateSalt(): string {
    if (!appLocalSalt) {
        appLocalSalt = createHash('sha256')
            .update(`${ANONYMIZER_SALT_KEY}:${randomBytes(32).toString('hex')}`)
            .digest('hex');
    }
    return appLocalSalt;
}

function generateSalt(): string {
    return createHash('sha256')
        .update(`${ANONYMIZER_SALT_KEY}:${randomBytes(32).toString('hex')}`)
        .digest('hex');
}

function initializeSalt(persistedSalt?: string): void {
    if (persistedSalt) {
        appLocalSalt = persistedSalt;
        return;
    }
    getOrCreateSalt();
}

function getSalt(): string {
    return getOrCreateSalt();
}

const PRIVATE_IP_PATTERNS: ReadonlyArray<{ prefix: string; check: (octets: number[]) => boolean }> = [
    { prefix: '10.', check: (octets) => octets[0]! === 10 },
    { prefix: '172.', check: (octets) => octets[0]! === 172 && octets[1]! >= 16 && octets[1]! <= 31 },
    { prefix: '192.168.', check: (octets) => octets[0]! === 192 && octets[1]! === 168 },
];

function normalizeMappedIPv4(address: string): string {
    const match = address.toLowerCase().match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    return match ? match[1]! : address;
}

function isPrivateIP(address: string): boolean {
    const normalized = normalizeMappedIPv4(address);

    if (isLocalhost(normalized)) {
        return true;
    }

    const octets = normalized.split('.').map(Number);
    if (octets.length !== 4 || octets.some(isNaN)) {
        return isIPv6Private(normalized);
    }

    return PRIVATE_IP_PATTERNS.some(({ check }) => check(octets));
}

function isIPv6Private(address: string): boolean {
    const normalized = address.toLowerCase();
    return normalized.startsWith('fc')
        || normalized.startsWith('fd')
        || normalized.startsWith('fe80:');
}

function hashIP(address: string): string {
    const salt = getOrCreateSalt();
    return createHash('sha256')
        .update(`${salt}:${address}`)
        .digest('hex')
        .substring(0, 16);
}

function anonymizeIPAddress(address: string): string {
    if (isLocalhost(address)) {
        return address;
    }

    if (isPrivateIP(address)) {
        return `hashed:${hashIP(address)}`;
    }

    return address;
}

function isLocalhost(address: string): boolean {
    const localhostPatterns = [
        '127.0.0.1',
        '::1',
        'localhost',
        '0.0.0.0',
    ];
    return localhostPatterns.includes(address.toLowerCase());
}

function isLocalhostConnection(connection: NetworkConnection): boolean {
    return isLocalhost(connection.remoteAddress) || isLocalhost(connection.localAddress);
}

function stripMACAddress(value: string): string {
    const macRegex = /([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/g;
    return value.replace(macRegex, '[MAC_REMOVED]');
}

const USER_PATH_PATTERNS: ReadonlyArray<RegExp> = [
    /\/Users\/[^/]+/g,
    /\/home\/[^/]+/g,
    /C:\\Users\\[^\\]+/gi,
    /C:\\Documents and Settings\\[^\\]+/gi,
];

function sanitizeProcessPath(processPath: string): string {
    let sanitized = removeUserFromPath(processPath);
    sanitized = basename(sanitized);
    sanitized = stripMACAddress(sanitized);
    return sanitized;
}

function removeUserFromPath(filePath: string): string {
    let sanitized = filePath;
    for (const pattern of USER_PATH_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[USER_PATH]');
    }
    return sanitized;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function aggregateTimestamp(timestamp: number): number {
    return Math.floor(timestamp / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;
}

function anonymizeConnection(
    connection: NetworkConnection,
    isNew: boolean,
    isChanged: boolean
): AnonymizedConnection {
    return {
        id: connection.id,
        protocol: connection.protocol,
        localPort: connection.localPort,
        remoteAddress: anonymizeIPAddress(connection.remoteAddress),
        remotePort: connection.remotePort,
        state: connection.state,
        processName: sanitizeProcessPath(connection.processName),
        isNew,
        isChanged,
    };
}

function anonymize(
    connections: NetworkConnection[],
    newConnectionIds?: Set<string>,
    changedConnectionIds?: Set<string>
): AnonymizedPayload {
    const filtered = connections.filter((conn) => !isLocalhostConnection(conn));

    const anonymizedConnections = filtered.map((conn) => {
        const isNew = newConnectionIds?.has(conn.id) ?? false;
        const isChanged = changedConnectionIds?.has(conn.id) ?? false;
        return anonymizeConnection(conn, isNew, isChanged);
    });

    return {
        connections: anonymizedConnections,
        scanTimestamp: aggregateTimestamp(Date.now()),
        platform: sanitizePlatform(),
        totalActive: anonymizedConnections.length,
    };
}

function sanitizePlatform(): string {
    const platformMap: Record<string, string> = {
        darwin: 'macOS',
        win32: 'Windows',
        linux: 'Linux',
    };
    return platformMap[process.platform] ?? 'Unknown';
}

export {
    anonymize,
    anonymizeIPAddress,
    isPrivateIP,
    isLocalhost,
    isLocalhostConnection,
    stripMACAddress,
    sanitizeProcessPath,
    removeUserFromPath,
    aggregateTimestamp,
    initializeSalt,
    generateSalt,
    getSalt,
};
