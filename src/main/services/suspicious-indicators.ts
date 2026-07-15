const SUSPICIOUS_PORTS: ReadonlySet<number> = new Set([
    4444,
    6667, 6668, 6669,
    3333,
    5555,
    31337,
    12345,
    1080,
    9050, 9051,
    23,
    8333,
    4443,
    5900,
    27374,
    1337,
    65535,
    54321,
]);

const PRIVATE_IP_PREFIXES: ReadonlyArray<string> = [
    '10.',
    '172.16.', '172.17.', '172.18.', '172.19.',
    '172.20.', '172.21.', '172.22.', '172.23.',
    '172.24.', '172.25.', '172.26.', '172.27.',
    '172.28.', '172.29.', '172.30.', '172.31.',
    '192.168.',
    '169.254.',
];

const LOOPBACK_AND_UNSPECIFIED: ReadonlySet<string> = new Set([
    '0.0.0.0',
    '127.0.0.1',
    '::',
    '::1',
    'localhost',
    '*',
]);

const SUSPICIOUS_IP_LIST: ReadonlySet<string> = new Set<string>([]);

function isLoopbackOrUnspecified(ip: string): boolean {
    const normalized = ip.toLowerCase().trim();
    if (LOOPBACK_AND_UNSPECIFIED.has(normalized)) return true;
    if (normalized.startsWith('127.')) return true;
    return false;
}

function isMulticast(ip: string): boolean {
    const normalized = ip.toLowerCase().trim();
    if (normalized.startsWith('ff')) return true;
    const firstOctet = Number.parseInt(normalized.split('.')[0] ?? '', 10);
    return firstOctet >= 224 && firstOctet <= 239;
}

function isPrivateIP(ip: string): boolean {
    const normalized = ip.toLowerCase().trim();
    if (isLoopbackOrUnspecified(normalized)) return true;
    if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    return PRIVATE_IP_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isSuspiciousIP(ip: string, list: ReadonlySet<string> = SUSPICIOUS_IP_LIST): boolean {
    if (!ip) return false;
    const normalized = ip.toLowerCase().trim();
    if (isLoopbackOrUnspecified(normalized)) return false;
    if (isMulticast(normalized)) return false;
    if (isPrivateIP(normalized)) return false;
    return list.has(normalized);
}

export {
    SUSPICIOUS_PORTS,
    PRIVATE_IP_PREFIXES,
    SUSPICIOUS_IP_LIST,
    isPrivateIP,
    isSuspiciousIP,
    isLoopbackOrUnspecified,
    isMulticast,
};
