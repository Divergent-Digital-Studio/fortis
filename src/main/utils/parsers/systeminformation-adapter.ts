import type { Systeminformation } from 'systeminformation';
import type { NetworkConnection, ConnectionState, Protocol } from '@shared/types';
import type { IConnectionParser } from './parser.interface';
import type { SupportedPlatform } from '../platform';
import { getPlatform } from '../platform';

const STATE_MAP: Record<string, ConnectionState> = {
    ESTABLISHED: 'ESTABLISHED',
    LISTEN: 'LISTEN',
    LISTENING: 'LISTEN',
    SYN_SENT: 'SYN_SENT',
    SYN_RECV: 'SYN_RECV',
    FIN_WAIT1: 'FIN_WAIT1',
    FIN_WAIT2: 'FIN_WAIT2',
    TIME_WAIT: 'TIME_WAIT',
    CLOSE_WAIT: 'CLOSE_WAIT',
    LAST_ACK: 'LAST_ACK',
    CLOSING: 'CLOSING',
    CLOSED: 'CLOSED',
};

function normalizeState(raw: string): ConnectionState {
    const upper = raw.toUpperCase().replace(/-/g, '_');
    return STATE_MAP[upper] ?? 'ESTABLISHED';
}

function normalizeProtocol(raw: string): Protocol {
    const lower = raw.toLowerCase();
    if (lower.startsWith('udp')) return 'udp';
    return 'tcp';
}

function generateFallbackId(
    protocol: Protocol,
    localAddress: string,
    localPort: number,
    peerAddress: string,
    peerPort: number,
    pid: number,
): string {
    return `${protocol}:${localAddress}:${localPort}-${peerAddress}:${peerPort}:${pid}`;
}

function mapConnection(
    conn: Systeminformation.NetworkConnectionsData,
): NetworkConnection {
    const protocol = normalizeProtocol(conn.protocol);
    const localAddress = conn.localAddress || '0.0.0.0';
    const localPort = conn.localPort ? Number(conn.localPort) : 0;
    const peerAddress = conn.peerAddress || '0.0.0.0';
    const peerPort = conn.peerPort ? Number(conn.peerPort) : 0;
    const state = normalizeState(conn.state || 'ESTABLISHED');
    const processName = conn.process || 'unknown';
    const processId = conn.pid ?? 0;

    return {
        id: generateFallbackId(protocol, localAddress, localPort, peerAddress, peerPort, processId),
        protocol,
        localAddress,
        localPort,
        remoteAddress: peerAddress,
        remotePort: peerPort,
        state,
        processName,
        processId,
        timestamp: Date.now(),
    };
}

type SystemInformationModule = typeof import('systeminformation');

let cachedModule: Promise<SystemInformationModule> | null = null;

function loadSystemInformation(): Promise<SystemInformationModule> {
    if (!cachedModule) {
        cachedModule = import('systeminformation');
    }
    return cachedModule;
}

export class SystemInfoFallbackAdapter implements IConnectionParser {
    async parse(): Promise<NetworkConnection[]> {
        try {
            const si = await loadSystemInformation();
            const connections = await si.networkConnections();
            return connections.map(mapConnection);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[SystemInfoFallbackAdapter] networkConnections failed: ${message}`);
            return [];
        }
    }

    getPlatform(): SupportedPlatform {
        return getPlatform();
    }
}
