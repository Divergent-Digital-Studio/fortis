import { execFile } from 'node:child_process';
import type { NetworkConnection, ConnectionState, Protocol } from '@shared/types';
import type { SupportedPlatform } from '../platform';
import { generateConnectionId } from '../connection-id';
import type { IConnectionParser } from './parser.interface';

const COMMAND_TIMEOUT_MS = 15_000;

const STATE_MAP: Record<string, ConnectionState> = {
    ESTAB: 'ESTABLISHED',
    ESTABLISHED: 'ESTABLISHED',
    LISTEN: 'LISTEN',
    SYN_SENT: 'SYN_SENT',
    SYN_RECV: 'SYN_RECV',
    FIN_WAIT1: 'FIN_WAIT1',
    FIN_WAIT2: 'FIN_WAIT2',
    TIME_WAIT: 'TIME_WAIT',
    CLOSE_WAIT: 'CLOSE_WAIT',
    LAST_ACK: 'LAST_ACK',
    CLOSING: 'CLOSING',
    CLOSE: 'CLOSED',
    CLOSED: 'CLOSED',
    UNCONN: 'CLOSED',
};

function normalizeState(raw: string): ConnectionState {
    const upper = raw.toUpperCase().replace(/-/g, '_');

    const direct = STATE_MAP[upper];
    if (direct) return direct;

    if (upper.startsWith('FIN_WAIT_2')) return 'FIN_WAIT2';
    if (upper.startsWith('FIN_WAIT')) return 'FIN_WAIT1';
    if (upper.startsWith('CLOSE_WAIT')) return 'CLOSE_WAIT';

    return 'ESTABLISHED';
}

function normalizeProtocol(raw: string): Protocol {
    const lower = raw.toLowerCase();
    if (lower === 'udp' || lower === 'udp6') return 'udp';
    return 'tcp';
}

interface AddressParts {
    address: string;
    port: number;
}

function parseAddressPort(raw: string): AddressParts {
    if (!raw || raw === '*:*' || raw === '*' || raw === '0.0.0.0:*') {
        return { address: '0.0.0.0', port: 0 };
    }

    if (raw.startsWith('[')) {
        const bracketMatch = raw.match(/^\[([^\]]*)\]:(\d+|\*)$/);
        if (bracketMatch) {
            const address = bracketMatch[1] === '::' ? '::' : (bracketMatch[1] ?? '::');
            const port = bracketMatch[2] === '*' ? 0 : (parseInt(bracketMatch[2] ?? '0', 10) || 0);
            return { address, port };
        }
    }

    const lastColon = raw.lastIndexOf(':');
    if (lastColon === -1) {
        return { address: raw, port: 0 };
    }

    const address = raw.substring(0, lastColon);
    const portStr = raw.substring(lastColon + 1);
    const port = portStr === '*' ? 0 : (parseInt(portStr, 10) || 0);

    return {
        address: address || '0.0.0.0',
        port: isNaN(port) ? 0 : port,
    };
}

interface ProcessInfo {
    processName: string;
    pid: number;
}

function extractProcessInfo(usersSection: string): ProcessInfo {
    const match = usersSection.match(/\("([^"]*)",pid=(\d+)/);
    if (match) {
        return {
            processName: match[1] ?? '',
            pid: parseInt(match[2] ?? '0', 10) || 0,
        };
    }

    const simplePidMatch = usersSection.match(/pid=(\d+)/);
    if (simplePidMatch) {
        return {
            processName: '',
            pid: parseInt(simplePidMatch[1] ?? '0', 10) || 0,
        };
    }

    return { processName: '', pid: 0 };
}

function parseSsOutput(stdout: string): NetworkConnection[] {
    const lines = stdout.split('\n');
    const connections: NetworkConnection[] = [];

    let headerSkipped = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) continue;

        if (!headerSkipped) {
            if (line.startsWith('Netid') || line.startsWith('State')) {
                headerSkipped = true;
                continue;
            }
        }

        const netidMatch = line.match(/^(tcp|tcp6|udp|udp6)\s+/i);
        if (!netidMatch) continue;

        const netid = netidMatch[1] ?? '';
        const restOfLine = line.substring(netid.length).trim();

        const fields = restOfLine.split(/\s+/);

        if (fields.length < 5) continue;

        const state = fields[0] ?? '';
        const localAddr = fields[3] ?? '';
        const peerAddr = fields[4] ?? '';

        let usersSection = '';
        const usersIdx = line.indexOf('users:((');
        if (usersIdx !== -1) {
            usersSection = line.substring(usersIdx);
        }

        const { processName, pid } = extractProcessInfo(usersSection);
        const protocol = normalizeProtocol(netid);
        const local = parseAddressPort(localAddr);
        const remote = parseAddressPort(peerAddr);

        let connectionState: ConnectionState;
        if (protocol === 'udp') {
            connectionState = state && state !== 'UNCONN' ? normalizeState(state) : 'ESTABLISHED';
        } else {
            connectionState = state ? normalizeState(state) : 'ESTABLISHED';
        }

        const id = generateConnectionId(
            protocol,
            local.address,
            local.port,
            remote.address,
            remote.port,
            pid,
        );

        connections.push({
            id,
            protocol,
            localAddress: local.address,
            localPort: local.port,
            remoteAddress: remote.address,
            remotePort: remote.port,
            state: connectionState,
            processName: processName || (pid > 0 ? `PID:${pid}` : 'unknown'),
            processId: pid,
            timestamp: Date.now(),
        });
    }

    return connections;
}

function executeSs(): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            'ss',
            ['-tuapen'],
            {
                timeout: COMMAND_TIMEOUT_MS,
                maxBuffer: 10 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
                if (error) {
                    const code = (error as NodeJS.ErrnoException).code;

                    if (code === 'ENOENT') {
                        reject(new SsNotFoundError());
                        return;
                    }

                    if (code === 'EACCES' || code === 'EPERM') {
                        reject(new SsPermissionError());
                        return;
                    }

                    if (error.killed) {
                        reject(new SsTimeoutError(COMMAND_TIMEOUT_MS));
                        return;
                    }

                    if (stdout && stdout.trim().length > 0) {
                        resolve(stdout);
                        return;
                    }

                    reject(new SsExecutionError(error.message, stderr));
                    return;
                }

                resolve(stdout);
            },
        );
    });
}

function executeSsFallback(): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            'ss',
            ['-tuane'],
            {
                timeout: COMMAND_TIMEOUT_MS,
                maxBuffer: 10 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
                if (error) {
                    const code = (error as NodeJS.ErrnoException).code;

                    if (code === 'ENOENT') {
                        reject(new SsNotFoundError());
                        return;
                    }

                    if (error.killed) {
                        reject(new SsTimeoutError(COMMAND_TIMEOUT_MS));
                        return;
                    }

                    if (stdout && stdout.trim().length > 0) {
                        resolve(stdout);
                        return;
                    }

                    reject(new SsExecutionError(error.message, stderr));
                    return;
                }

                resolve(stdout);
            },
        );
    });
}

export class SsNotFoundError extends Error {
    constructor() {
        super('ss command not found. Ensure iproute2 is installed on the system.');
        this.name = 'SsNotFoundError';
    }
}

export class SsPermissionError extends Error {
    constructor() {
        super(
            'Permission denied running ss -tuapen. The -p flag requires root/sudo privileges to show process information. ' +
            'Falling back to -tuane mode (without process names).',
        );
        this.name = 'SsPermissionError';
    }
}

export class SsTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`ss command timed out after ${timeoutMs}ms`);
        this.name = 'SsTimeoutError';
    }
}

export class SsExecutionError extends Error {
    readonly stderr: string;

    constructor(message: string, stderr: string) {
        super(`ss execution failed: ${message}`);
        this.name = 'SsExecutionError';
        this.stderr = stderr;
    }
}

export class LinuxParser implements IConnectionParser {
    async parse(): Promise<NetworkConnection[]> {
        try {
            const stdout = await executeSs();
            return parseSsOutput(stdout);
        } catch (error) {
            if (error instanceof SsPermissionError) {
                console.warn('[LinuxParser] -p flag requires root, falling back to -tuane mode');
                return this.parseFallback();
            }

            if (
                error instanceof SsNotFoundError ||
                error instanceof SsTimeoutError
            ) {
                console.error(`[LinuxParser] ${(error as Error).name}: ${(error as Error).message}`);
                throw error;
            }

            console.error('[LinuxParser] Unexpected error during parse:', error);
            throw error;
        }
    }

    private async parseFallback(): Promise<NetworkConnection[]> {
        try {
            const stdout = await executeSsFallback();
            return parseSsOutput(stdout);
        } catch (fallbackError) {
            console.error('[LinuxParser] Fallback -tuane also failed:', fallbackError);
            throw fallbackError;
        }
    }

    getPlatform(): SupportedPlatform {
        return 'linux';
    }
}

export {
    parseSsOutput,
    parseAddressPort,
    generateConnectionId,
    normalizeState,
    normalizeProtocol,
    extractProcessInfo,
};
