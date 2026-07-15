export interface WifiDevice {
    mac: string;
    ip: string;
    vendor: string | null;
    hostname: string | null;
    /** User-assigned friendly name; takes precedence over hostname/vendor in the UI. */
    customName: string | null;
    firstSeen: number;
    lastSeen: number;
    isIot: boolean;
    iotCategory: string | null;
}

export type DnsSource = 'cache' | 'ptr';

export interface DnsQueryRecord {
    id: string;
    domain: string;
    resolvedIp: string | null;
    source: DnsSource;
    processName: string | null;
    firstSeen: number;
    lastSeen: number;
    hitCount: number;
}

export type VpnVerdict = 'pass' | 'warn' | 'fail';

export interface VpnLeakStatus {
    verdict: VpnVerdict;
    tunnelActive: boolean;
    tunnelInterface: string | null;
    defaultRouteThroughTunnel: boolean;
    explanation: string;
    timestamp: number;
}

export interface GeoConnection {
    remoteAddress: string;
    countryCode: string | null;
    countryName: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    connectionCount: number;
}

export interface IotDevice {
    mac: string;
    ip: string;
    vendor: string | null;
    /** Primary display name for the device (custom name > hostname > vendor). */
    name: string;
    category: string;
    firstSeen: number;
    lastSeen: number;
    /**
     * Countries reached by this host's outbound connections, not by this device.
     * Sockets carry no LAN-device owner, so the value is network-wide and identical
     * on every device; the UI must present it as such.
     */
    destinations: string[];
    /** Network-wide, for the same reason as `destinations`. */
    hasAnomaly: boolean;
    anomalyReason: string | null;
}

export type CollectorHealth = 'ok' | 'degraded' | 'unsupported';
